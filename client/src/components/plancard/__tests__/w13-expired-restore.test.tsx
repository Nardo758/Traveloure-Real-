/**
 * W13 (ledger `2026-11-07-w13-expired-restore`; Wording approved — Leon, Nov 7, 2026): an expired restore snapshot
 * is said once — "Your draft for Day {day} is no longer saved. Nothing on your plan changed." — one line per expired
 * day, dismissable, never shown again for that snapshot. Unexpired rows and the restore action are unchanged.
 *   E1  the line, filled; the strip renders when the only answer is an expired day (it used to vanish)
 *   E2  the expired line has a dismiss and no restore button; restorable / changed rows are unchanged beside it
 *   E3  seen and dismissed snapshots are not shown again; the store round-trips; a throwing store reads as none seen
 *   E4  the strip marks a drawn snapshot seen after it renders, and on dismiss; the restore POST is untouched
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/components/plancard/__tests__/w13-expired-restore.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { VersionsRestoreView } from "../VersionsRestoreStrip";
import {
  RESTORE_EXPIRED_SEEN_KEY,
  VERSIONS_RESTORE_UI_COPY as C,
  expiredToShow,
  markExpiredSeen,
  readExpiredSeen,
  restoreExpiredLine,
  restoreRowsToShow,
} from "@/lib/versions-restore";

(globalThis as any).React = React;
const text = (h: string) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const APPLIED = "2026-10-01T10:00:00.000Z";
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("W13 expired restore line", () => {
  it("E1 the line; an expired-only answer draws the strip", () => {
    assert.equal(C.expired, "Your draft for Day {day} is no longer saved. Nothing on your plan changed.");
    assert.equal(restoreExpiredLine(4), "Your draft for Day 4 is no longer saved. Nothing on your plan changed.");
    const shown = restoreRowsToShow([{ day: 4, snapshotId: "s4", appliedAt: APPLIED, state: "expired" }]);
    assert.deepEqual(shown, { finalized: false, rows: [], expired: [{ day: 4, snapshotId: "s4" }] });
    const html = renderToString(<VersionsRestoreView finalized={false} rows={[]} previewDay={null} pending={false} notes={{}} expired={shown.expired} />);
    assert.match(html, /data-testid="versions-restore-strip"/);
    assert.equal(text(html).split(restoreExpiredLine(4)).length - 1, 1, "said once");
    // Before W13 the same answer drew nothing:
    assert.equal(renderToString(<VersionsRestoreView finalized={false} rows={[]} previewDay={null} pending={false} notes={{}} />), "");
  });

  it("E2 a dismiss and no restore button; unexpired rows unchanged", () => {
    const html = renderToString(
      <VersionsRestoreView
        finalized={false}
        rows={[{ day: 1, snapshotId: "s1", appliedAt: APPLIED, kind: "restorable" }]}
        previewDay={null}
        pending={false}
        notes={{ 2: "expired" }}
        expired={[{ day: 2, snapshotId: "s2" }]}
      />,
    );
    assert.match(html, /data-testid="versions-restore-expired-dismiss-2"[^>]*>×</);
    assert.match(html, /aria-label="Dismiss"/);
    assert.doesNotMatch(html, /versions-restore-go-2/);
    assert.match(html, /data-testid="versions-restore-go-1"/, "the restorable day keeps its button");
    assert.equal(text(html).split(restoreExpiredLine(2)).length - 1, 1, "a 409 expired note on the same day is not said twice");
  });

  it("E3 seen / dismissed are not shown again", () => {
    const store = memStore();
    assert.deepEqual(Array.from(readExpiredSeen(store)), []);
    markExpiredSeen(store, ["s2", "s3"]);
    assert.deepEqual(JSON.parse(store.m.get(RESTORE_EXPIRED_SEEN_KEY)!), ["s2", "s3"]);
    const seen = readExpiredSeen(store);
    const all = [{ day: 2, snapshotId: "s2" }, { day: 5, snapshotId: "s5" }, { day: 6, snapshotId: "s6" }];
    assert.deepEqual(expiredToShow(all, seen, new Set(["s6"])), [{ day: 5, snapshotId: "s5" }]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    assert.deepEqual(Array.from(readExpiredSeen(throwing)), []);
    markExpiredSeen(throwing, ["s9"]); // does not throw
  });

  it("E4 the strip records a drawn line as seen and on dismiss; the restore action is unchanged", () => {
    const src = readFileSync("client/src/components/plancard/VersionsRestoreStrip.tsx", "utf8");
    assert.match(src, /const \[seenAtMount\] = useState\(\(\) => readExpiredSeen\(/);
    assert.match(src, /const expired = expiredToShow\(shown\.expired, seenAtMount, dismissed\);/);
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?markExpiredSeen\([^)]*expiredIds\.split\(","\)\);\s*\}, \[shownForRole, expiredIds\]\);/);
    assert.match(src, /onDismissExpired=\{\(id\) => \{\s*setDismissed\(\(prev\) => new Set\(prev\)\.add\(id\)\);\s*markExpiredSeen\(/);
    assert.equal(src.split('apiRequest("POST", restoreUrl(tripId, v.day), v.body)').length - 1, 1, "the one restore POST, unchanged");
  });
});
