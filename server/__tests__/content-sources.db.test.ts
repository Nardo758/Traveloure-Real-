/**
 * A6 (2) — the content source registry's ONE writer against a real database (ledger
 * `2026-10-01-a6-registry-surface`; a6-design decisions 1B + 2A).
 *
 *   R1  create is born inactive with NO terms check; `added_by` is the actor; a create naming a terms
 *       or activation field is refused (`.strict()`), never trimmed
 *   R2  free text in covers / does_not_cover is refused by name; a named sub-need is admitted
 *   R3  a general edit STRIPS terms_checked_at / terms_checked_by / active — they are never written
 *   R4  activation is refused for an admin outside the config allowlist, and for everyone when the
 *       allowlist is unset (fail closed)
 *   R5  the allowlisted activator's activation stamps the database's now() and the actor, in one row
 *   R6  editing a terms-bound field (terms URL) clears the check and deactivates; editing notes does not
 *   R7  deactivation keeps the terms check as history
 *   R8  a row with no valid license class cannot be activated (409), and an unknown id is 404
 *   R9  every route the router declares sits under /api/admin (the §2 blanket guard)
 *   R10 ruling R-p: public_ok is set only by the activator, only on an official + terms-checked row,
 *       and stamps now() + the actor; `false` is recorded too; an editorial or unchecked row is 409;
 *       a body with anything but `publicOk` is refused (.strict)
 *   R11 a general edit cannot set public_ok or its stamps; an edit that clears the terms check clears
 *       the public answer with it; a notes edit keeps it
 *   R12 create refuses public_ok (.strict); a new row is born NOT ANSWERED (NULL), never false
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, like, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { contentSources } from "@shared/schema";
import {
  ContentSourceError,
  activateContentSource,
  createContentSource,
  deactivateContentSource,
  editContentSource,
  setContentSourcePublicOk,
} from "../services/content-sources.service";

const RUN = crypto.randomUUID().slice(0, 8).replace(/-/g, "");
const sid = (s: string) => `a6r_${RUN}_${s}`;
const founder = `a6r-${RUN}-founder`;
const otherAdmin = `a6r-${RUN}-admin`;

const base = (id: string) => ({
  id,
  name: `Registry ${id}`,
  homepage: "https://example.org/",
  market: "kyoto",
  adapter: "manual",
  covers: ["transport.intercity"],
  doesNotCover: ["transport.intercity.rail"],
  licenseClass: "official",
  termsUrl: "https://example.org/terms",
});

async function refused(p: Promise<unknown>, code: string, status: number) {
  await assert.rejects(p, (e: unknown) => e instanceof ContentSourceError && e.code === code && e.status === status);
}

before(async () => {
  for (const u of [founder, otherAdmin]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'A6', 'Admin', 'admin')`);
  }
  process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS = founder;
});

after(async () => {
  await db.delete(contentSources).where(like(contentSources.id, `a6r_${RUN}_%`));
  await db.execute(sql`DELETE FROM users WHERE id IN (${founder}, ${otherAdmin})`);
  await pool.end();
});

test("R1: born inactive, unchecked, added_by the actor; terms fields refused at create", async () => {
  const row = await createContentSource(base(sid("r1")), otherAdmin);
  assert.equal(row.active, false);
  assert.equal(row.termsCheckedAt, null);
  assert.equal(row.termsCheckedBy, null);
  assert.equal(row.addedBy, otherAdmin);
  assert.deepEqual(row.doesNotCover, ["transport.intercity.rail"]);
  await refused(createContentSource({ ...base(sid("r1b")), termsCheckedAt: new Date().toISOString() }, otherAdmin), "invalid_body", 400);
  await refused(createContentSource({ ...base(sid("r1c")), active: true }, otherAdmin), "invalid_body", 400);
  await refused(createContentSource(base(sid("r1")), otherAdmin), "id_taken", 409);
});

test("R2: free text refused by name; a named sub-need admitted", async () => {
  await assert.rejects(
    createContentSource({ ...base(sid("r2")), covers: ["dining", "everything else"] }, otherAdmin),
    (e: unknown) => e instanceof ContentSourceError && e.code === "unknown_need" && JSON.stringify(e.details).includes("everything else"),
  );
  const ok = await createContentSource({ ...base(sid("r2ok")), covers: ["transport.local.fares"] }, otherAdmin);
  assert.deepEqual(ok.covers, ["transport.local.fares"]);
});

test("R3: a general edit strips terms and activation fields", async () => {
  await createContentSource(base(sid("r3")), otherAdmin);
  const row = await editContentSource(sid("r3"), {
    notes: "edited",
    termsCheckedAt: "2020-01-01T00:00:00Z",
    termsCheckedBy: otherAdmin,
    active: true,
    addedBy: founder,
  });
  assert.equal(row.notes, "edited");
  assert.equal(row.termsCheckedAt, null);
  assert.equal(row.termsCheckedBy, null);
  assert.equal(row.active, false);
  assert.equal(row.addedBy, otherAdmin);
});

test("R4: activation is refused outside the allowlist, and for everyone when it is unset", async () => {
  await createContentSource(base(sid("r4")), otherAdmin);
  await refused(activateContentSource(sid("r4"), otherAdmin), "not_activator", 403);
  await refused(activateContentSource(sid("r4"), null), "not_activator", 403);
  process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS = "";
  try {
    await refused(activateContentSource(sid("r4"), founder), "not_activator", 403);
  } finally {
    process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS = founder;
  }
  const [row] = await db.select().from(contentSources).where(eq(contentSources.id, sid("r4")));
  assert.equal(row.active, false);
  assert.equal(row.termsCheckedAt, null);
});

test("R5: the activator's activation stamps now() and the actor", async () => {
  await createContentSource(base(sid("r5")), otherAdmin);
  const before = Date.now();
  const row = await activateContentSource(sid("r5"), founder);
  assert.equal(row.active, true);
  assert.equal(row.termsCheckedBy, founder);
  assert.ok(row.termsCheckedAt && Math.abs(new Date(row.termsCheckedAt).getTime() - before) < 120_000);
});

test("R6: changing the terms URL clears the check and deactivates; changing notes does not", async () => {
  await createContentSource(base(sid("r6")), otherAdmin);
  await activateContentSource(sid("r6"), founder);
  const notes = await editContentSource(sid("r6"), { notes: "still fine" });
  assert.equal(notes.active, true);
  assert.equal(notes.termsCheckedBy, founder);
  const sameUrl = await editContentSource(sid("r6"), { termsUrl: "https://example.org/terms" });
  assert.equal(sameUrl.active, true, "an unchanged value is not a change");
  const moved = await editContentSource(sid("r6"), { termsUrl: "https://example.org/new-terms" });
  assert.equal(moved.active, false);
  assert.equal(moved.termsCheckedAt, null);
  assert.equal(moved.termsCheckedBy, null);
});

test("R7: deactivation keeps the terms check as history", async () => {
  await createContentSource(base(sid("r7")), otherAdmin);
  await activateContentSource(sid("r7"), founder);
  const row = await deactivateContentSource(sid("r7"));
  assert.equal(row.active, false);
  assert.equal(row.termsCheckedBy, founder);
  assert.ok(row.termsCheckedAt);
});

test("R8: no valid license class ⇒ 409; unknown id ⇒ 404", async () => {
  await db.insert(contentSources).values({
    id: sid("r8"), name: "legacy", adapter: "manual", covers: ["dining"], doesNotCover: [],
    licenseClass: "unknown", active: false,
  });
  await refused(activateContentSource(sid("r8"), founder), "not_activatable", 409);
  await refused(activateContentSource(sid("nope"), founder), "not_found", 404);
  await refused(editContentSource(sid("nope"), { notes: "x" }), "not_found", 404);
  await refused(deactivateContentSource(sid("nope")), "not_found", 404);
});

test("R9: every registry route sits under /api/admin", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server", "routes", "content-sources.routes.ts"), "utf8");
  const paths = [...src.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((m) => m[2]);
  assert.equal(paths.length, 6);
  assert.ok(paths.every((p) => p.startsWith("/api/admin/content-sources")), paths.join(", "));
});

test("R10: public_ok — activator only, official + terms-checked only, stamped; false recorded too", async () => {
  await createContentSource(base(sid("r10")), otherAdmin);
  await refused(setContentSourcePublicOk(sid("r10"), { publicOk: true }, founder), "not_public_eligible", 409);
  await activateContentSource(sid("r10"), founder);
  await refused(setContentSourcePublicOk(sid("r10"), { publicOk: true }, otherAdmin), "not_activator", 403);
  await refused(setContentSourcePublicOk(sid("r10"), { publicOk: true, active: true }, founder), "invalid_body", 400);
  await refused(setContentSourcePublicOk(sid("r10"), {}, founder), "invalid_body", 400);
  const before = Date.now();
  const yes = await setContentSourcePublicOk(sid("r10"), { publicOk: true }, founder);
  assert.equal(yes.publicOk, true);
  assert.equal(yes.publicOkCheckedBy, founder);
  assert.ok(yes.publicOkCheckedAt && Math.abs(new Date(yes.publicOkCheckedAt).getTime() - before) < 120_000);
  const no = await setContentSourcePublicOk(sid("r10"), { publicOk: false }, founder);
  assert.equal(no.publicOk, false, "answered no is recorded, not erased");
  assert.equal(no.publicOkCheckedBy, founder);

  await createContentSource({ ...base(sid("r10ed")), licenseClass: "editorial" }, otherAdmin);
  await activateContentSource(sid("r10ed"), founder);
  await refused(setContentSourcePublicOk(sid("r10ed"), { publicOk: true }, founder), "not_public_eligible", 409);
  await refused(setContentSourcePublicOk(sid("nope"), { publicOk: true }, founder), "not_found", 404);
});

test("R11: a general edit cannot set public_ok; clearing the terms check clears it", async () => {
  await createContentSource(base(sid("r11")), otherAdmin);
  await activateContentSource(sid("r11"), founder);
  await setContentSourcePublicOk(sid("r11"), { publicOk: true }, founder);
  const stripped = await editContentSource(sid("r11"), { notes: "n", publicOk: false, publicOkCheckedBy: otherAdmin } as any);
  assert.equal(stripped.publicOk, true, "the general edit strips public_ok");
  assert.equal(stripped.publicOkCheckedBy, founder);
  const moved = await editContentSource(sid("r11"), { licenseClass: "editorial" });
  assert.equal(moved.termsCheckedAt, null);
  assert.equal(moved.publicOk, null, "the answer goes with the terms check it was given under");
  assert.equal(moved.publicOkCheckedAt, null);
  assert.equal(moved.publicOkCheckedBy, null);
});

test("R12: create refuses public_ok; a new source is born with public_ok NOT ANSWERED", async () => {
  await refused(createContentSource({ ...base(sid("r12x")), publicOk: true } as any, otherAdmin), "invalid_body", 400);
  const row = await createContentSource(base(sid("r12")), otherAdmin);
  assert.equal(row.publicOk, null);
  assert.equal(row.publicOkCheckedAt, null);
  assert.equal(row.publicOkCheckedBy, null);
});
