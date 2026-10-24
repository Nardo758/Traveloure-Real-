/**
 * Queue row 142. The Workstation day list reads `/api/trips/:id/plancard`, and the
 * shared query client keeps a successful read fresh forever (`staleTime: Infinity`),
 * so a write has to mark that query stale itself.
 *
 * `addFromSearchMutation` is the map-add path (canvas candidate pin and the search
 * rows). Its onSuccess invalidated the item list and the commission query, and not
 * the plancard. The other add paths in this file already invalidate the plancard.
 *
 * Run: npx tsx --test client/src/lib/__tests__/map-add-plancard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const workspace = readFileSync(resolve(ROOT, "client/src/pages/expert/workspace.tsx"), "utf8");

/** Source with prose removed, so a comment cannot satisfy a call pin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const PLANCARD_INVALIDATION =
  "queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });";

/**
 * The onSuccess handler that follows `marker`, up to its onError.
 * The handler is the invalidation, not the rest of the component.
 */
function onSuccessAfter(src: string, marker: string): string {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `expected to find ${marker}`);
  assert.equal(src.indexOf(marker, at + marker.length), -1, `${marker} is declared once`);
  const onSuccess = src.indexOf("onSuccess:", at);
  assert.ok(onSuccess >= 0, `${marker} has an onSuccess`);
  const onError = src.indexOf("onError:", onSuccess);
  assert.ok(onError > onSuccess, `${marker} has an onError after onSuccess`);
  return src.slice(onSuccess, onError);
}

test("map-add onSuccess invalidates the plancard query the same way the other add paths do", () => {
  const code = stripComments(workspace);
  const mapAdd = onSuccessAfter(code, "const addFromSearchMutation = useMutation({");
  const inlineAdd = onSuccessAfter(code, "function InlineAddItemForm(");
  const loggedBooking = onSuccessAfter(code, "function LogBookingForm(");

  assert.match(inlineAdd, /queryKey: \[`\/api\/trips\/\$\{tripId\}\/plancard`\]/);
  assert.match(loggedBooking, /queryKey: \[`\/api\/trips\/\$\{tripId\}\/plancard`\]/);
  assert.ok(
    mapAdd.includes(PLANCARD_INVALIDATION),
    "addFromSearchMutation onSuccess must invalidate the plancard query",
  );
  assert.match(mapAdd, /queryKey: \[`\/api\/trips\/\$\{tripId\}\/itinerary-items`\]/);
  assert.equal(inlineAdd.includes(PLANCARD_INVALIDATION), mapAdd.includes(PLANCARD_INVALIDATION));
});
