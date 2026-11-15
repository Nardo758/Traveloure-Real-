/**
 * Action engine PR 1 — the decision table.
 *
 * The rulings this pins (rev 3, Nov 13): Add / Book / "Ask an expert" / Details; ONE primary per tile; Share
 * as a secondary icon only; no priced or provider-submitting control in waitlist mode or on the guest path.
 *
 * A table, not a story: every row is a surface the app has, so a change to the order or to the refusal rule
 * fails here with the row's name rather than in a screenshot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_TAGS,
  PRIMARY_ORDER,
  actionAllowed,
  resolveActions,
  type ActionContext,
  type ActionIntent,
} from "../action-engine";

const OPEN: ActionContext = { mode: "open", signedIn: true };
const WAITLIST: ActionContext = { mode: "waitlist", signedIn: false };
const GUEST_OPEN: ActionContext = { mode: "open", signedIn: false };

type Row = {
  name: string;
  intent: ActionIntent;
  ctx: ActionContext;
  primary: string | null;
  secondary: string[];
  hidden: string[];
};

const ROWS: Row[] = [
  {
    name: "a priced listing, open mode: Book primary, Add + Details beside it",
    intent: { book: true, add: true, details: true },
    ctx: OPEN,
    primary: "book",
    secondary: ["add", "details"],
    hidden: [],
  },
  {
    name: "the same listing in waitlist: no Book, so Add becomes the primary",
    intent: { book: true, add: true, details: true },
    ctx: WAITLIST,
    primary: "add",
    secondary: ["details"],
    hidden: ["book"],
  },
  {
    name: "a placeable gem (no price): Add primary, Details secondary",
    intent: { add: true, details: true },
    ctx: OPEN,
    primary: "add",
    secondary: ["details"],
    hidden: [],
  },
  {
    name: "an expert-only card: Ask primary when open, refused in waitlist",
    intent: { ask: true, details: true },
    ctx: OPEN,
    primary: "ask",
    secondary: ["details"],
    hidden: [],
  },
  {
    name: "the same card in waitlist: Ask is refused as a provider submit",
    intent: { ask: true, details: true },
    ctx: WAITLIST,
    primary: "details",
    secondary: [],
    hidden: ["ask"],
  },
  {
    name: "a guest (signed out) on an open market never sees Book or Ask",
    intent: { book: true, ask: true, add: true },
    ctx: GUEST_OPEN,
    primary: "add",
    secondary: [],
    hidden: ["book", "ask"],
  },
  {
    name: "share is never the primary, whatever else is missing",
    intent: { share: true },
    ctx: OPEN,
    primary: null,
    secondary: ["share"],
    hidden: [],
  },
  {
    name: "share rides beside a real primary as an icon",
    intent: { add: true, share: true },
    ctx: OPEN,
    primary: "add",
    secondary: ["share"],
    hidden: [],
  },
  {
    name: "details alone is still one primary (a tile that only opens a page)",
    intent: { details: true },
    ctx: WAITLIST,
    primary: "details",
    secondary: [],
    hidden: [],
  },
  {
    name: "nothing offered: no primary, nothing hidden",
    intent: {},
    ctx: OPEN,
    primary: null,
    secondary: [],
    hidden: [],
  },
];

test("the engine answers exactly one primary per tile, for every row", () => {
  for (const row of ROWS) {
    const got = resolveActions(row.intent, row.ctx);
    assert.equal(got.primary, row.primary, `${row.name} — primary`);
    assert.deepEqual(got.secondary, row.secondary, `${row.name} — secondary`);
    assert.deepEqual(got.hidden.map((h) => h.tag), row.hidden, `${row.name} — hidden`);
    assert.notEqual(got.primary, "share", `${row.name} — share is never the primary`);
  }
});

test("no priced or provider-submitting control ever survives waitlist or the guest path", () => {
  for (const ctx of [WAITLIST, GUEST_OPEN]) {
    const got = resolveActions({ book: true, ask: true, add: true, details: true }, ctx);
    assert.ok(!got.secondary.includes("book"), "no Book");
    assert.ok(!got.secondary.includes("ask"), "no Ask");
    assert.ok(![got.primary, ...got.secondary].includes("book"));
    assert.ok(![got.primary, ...got.secondary].includes("ask"));
    assert.ok(got.hidden.length === 2, "both are reported, not silently dropped");
  }
});

test("the refusal reason says WHY, so a surface can explain itself", () => {
  const waitlist = resolveActions({ book: true, ask: true }, WAITLIST);
  assert.deepEqual(
    waitlist.hidden,
    [
      { tag: "book", reason: "priced_in_waitlist" },
      { tag: "ask", reason: "provider_submit" },
    ],
  );
});

test("the tag set and the primary order are the ruled ones", () => {
  assert.deepEqual([...ACTION_TAGS], ["book", "add", "ask", "details", "share"]);
  assert.deepEqual([...PRIMARY_ORDER], ["book", "add", "ask", "details"]);
  assert.equal(PRIMARY_ORDER.includes("share" as any), false, "share can never be primary");
});

test("the engine is pure: the same input answers the same shape twice", () => {
  const intent: ActionIntent = { book: true, add: true, share: true };
  const a = resolveActions(intent, OPEN);
  const b = resolveActions(intent, OPEN);
  assert.deepEqual(a, b);
  assert.equal(actionAllowed("details", WAITLIST), true);
  assert.equal(actionAllowed("book", WAITLIST), false);
  assert.equal(actionAllowed("ask", GUEST_OPEN), false);
});
