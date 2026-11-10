/**
 * use-debounced-value.test.tsx — TB2.6 (round 2, Leon Nov 10, 2026; PR A follow-up, Coding Bot review).
 *
 * The hook is RUN, not read: `react-dom/client` mounts a probe on a minimal fake DOM (the handful of node methods
 * React DOM's host config touches — no jsdom, the suite's no-jsdom posture kept), `act` flushes effects, and real
 * timers settle the value.
 *
 *   U1 the first render settles at once (no 300 ms gap before the first request)
 *   U2 a change is NOT settled before `delayMs`; it is after
 *   U3 a run of changes inside the window settles ONCE, on the last value (one request for three presses)
 *   U4 unmount clears the pending timer (no set-state on an unmounted probe — React warns on the console)
 *   U5 `DISCOVER_THEME_DEBOUNCE_MS` is 300, the number the server's discover limiter is sized against
 *
 * Run: npx tsx --test client/src/hooks/__tests__/use-debounced-value.test.tsx
 */
import React from "react";
(globalThis as any).React = React;
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DISCOVER_THEME_DEBOUNCE_MS, useDebouncedValue } from "../use-debounced-value";

class FakeNode {
  nodeType = 1;
  nodeName: string;
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  textContent = "";
  style: Record<string, string> = {};
  namespaceURI = "http://www.w3.org/1999/xhtml";
  ownerDocument: unknown;
  attrs: Record<string, string> = {};
  constructor(public tag = "div", doc?: unknown) {
    this.ownerDocument = doc;
    this.nodeName = tag.toUpperCase();
  }
  get tagName() { return this.nodeType === 1 ? this.tag.toUpperCase() : undefined; }
  appendChild(n: FakeNode) { n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n: FakeNode, ref: FakeNode | null) { n.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n: FakeNode) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  addEventListener() {}
  removeEventListener() {}
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] ?? null; }
  set nodeValue(v: string) { this.textContent = v; }
  get nodeValue() { return this.textContent; }
  /** Rendered text: React sets `textContent` on a single-text-child element and `nodeValue` on text nodes. */
  get text(): string { return this.nodeType === 3 || this.textContent ? this.textContent : this.childNodes.map((c) => c.text).join(""); }
}
const doc: any = {
  nodeType: 9,
  createElement: (t: string) => new FakeNode(t, doc),
  createElementNS: (_ns: string, t: string) => new FakeNode(t, doc),
  createTextNode: (s: string) => { const n = new FakeNode("#text", doc); n.nodeType = 3; n.nodeName = "#text"; n.textContent = s; return n; },
  addEventListener() {},
  removeEventListener() {},
  documentElement: new FakeNode("html"),
};
doc.defaultView = { document: doc, HTMLIFrameElement: class {}, navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {} };

let createRoot: typeof import("react-dom/client").createRoot;
let act: typeof import("react-dom/test-utils").act;
before(async () => {
  (globalThis as any).window = doc.defaultView;
  (globalThis as any).document = doc;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  createRoot = (await import("react-dom/client")).createRoot;
  act = (await import("react-dom/test-utils")).act;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(delayMs: number) {
  const container = new FakeNode("div", doc);
  let setValue!: (v: string) => void;
  function Probe() {
    const [v, set] = React.useState("a");
    setValue = set;
    const settled = useDebouncedValue(v, delayMs);
    return <span>{`${v}|${settled}`}</span>;
  }
  const root = createRoot(container as any);
  return {
    render: () => act(async () => { root.render(<Probe />); }),
    set: (v: string) => act(async () => { setValue(v); }),
    flush: () => act(async () => {}),
    unmount: () => act(async () => { root.unmount(); }),
    text: () => container.text,
  };
}

test("U1 the first render settles at once", async () => {
  const p = mount(300);
  await p.render();
  assert.equal(p.text(), "a|a");
  await p.unmount();
});

test("U2 a change settles after the delay, not before", async () => {
  const p = mount(120);
  await p.render();
  await p.set("b");
  assert.equal(p.text(), "b|a", "not yet");
  await sleep(60);
  await p.flush();
  assert.equal(p.text(), "b|a", "still inside the window");
  await sleep(90);
  await p.flush();
  assert.equal(p.text(), "b|b", "settled after the delay");
  await p.unmount();
});

test("U3 three quick changes settle once, on the last value", async () => {
  const p = mount(120);
  await p.render();
  await p.set("b");
  await sleep(40);
  await p.set("c");
  await sleep(40);
  await p.set("d");
  assert.equal(p.text(), "d|a", "nothing settled inside the window");
  await sleep(90);
  await p.flush();
  assert.equal(p.text(), "d|a", "the window restarted on the last change");
  await sleep(60);
  await p.flush();
  assert.equal(p.text(), "d|d");
  await p.unmount();
});

test("U4 unmount clears the pending timer", async () => {
  const p = mount(80);
  await p.render();
  await p.set("b");
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
  try {
    await p.unmount();
    await sleep(120);
    await act(async () => {});
  } finally {
    console.error = orig;
  }
  assert.deepEqual(errors.filter((e) => /unmounted|memory leak/i.test(e)), [], "no set-state after unmount");
});

test("U5 the discover debounce is the number the limiter is sized against", () => {
  assert.equal(DISCOVER_THEME_DEBOUNCE_MS, 300);
});
