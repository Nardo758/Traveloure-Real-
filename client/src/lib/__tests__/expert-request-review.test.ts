/**
 * expert-request-review — AN EXPERT REQUEST IS A CLICK, NEVER A DIALOG OPENING.
 *
 * Lane L19 of the Console & AI Concierge brief (`docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md`
 * §11.2 F1/F2, §11.3), ledger `2026-09-07-request-is-a-click`. CLAUDE.md §13 (honest-or-absent),
 * §18 rule 1 (one derivation, never two), Locked Decision 32.
 *
 * WHY THIS EXISTS, and why it is a SOURCE pin rather than a unit test alone. Both defects were
 * invisible to every other layer: the code compiled, the route answered 200, and the toast said
 * something true about a request that had genuinely been sent — the lie was that the traveler
 * never asked for it. `experience-template.tsx` POSTed `/api/expert-requests` from the handler
 * that OPENED the Get Expert Help dialog (after minting a slip), and the concierge surface
 * POSTed the same rail from the Destination Concierge tier's button. Nothing in tsc, in a server
 * test or in any grep gate can see that a network write hangs off a control that reads as a way
 * to LOOK at something. What can see it is a pin that asks WHICH FUNCTION the write lives in.
 *
 * THE PIN RULE (the neighbouring suites' rule, kept). Every source pin walks the FILE SET this
 * lane spans — the two surfaces, the shared sheet and the pure module — and asserts over what it
 * finds there. There is no literal call-site COUNT anywhere in this file: W1 discovers every
 * occurrence of the endpoint in the surfaces and asserts each one's ENCLOSING FUNCTION is the
 * named send handler, so a later lane may add or remove a send site freely and this pin still
 * fails the moment one lands outside the handler the review sheet's button calls.
 *
 * NEGATIVE SPACE, and it is the load-bearing half. These pins are STATIC. They can see which
 * function a `fetch` sits in; they cannot see who CALLS that function, they cannot prove the
 * sheet renders, and they cannot prove a button is reachable. A send handler wired to the tier
 * button instead of the sheet's would pass W1 and fail the browser — which is why W3/W4 pin the
 * trigger's own `onClick` and the sheet's `onSend` prop as well, and why the lane also extends
 * the concierge e2e (`e2e/specs/journey-7.spec.ts`) to assert that opening the panel creates no
 * request. Comment text is stripped before every source assertion, so a rule described in a
 * comment can never satisfy a pin about code.
 *
 * Run: npx tsx --test client/src/lib/__tests__/expert-request-review.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPERT_REQUEST_FREE_PRICE,
  EXPERT_REQUEST_NOT_SET,
  expertRequestDateLine,
  expertRequestPartyLine,
  expertRequestPlanRows,
  expertRequestRecipientLine,
} from "../expert-request-review";

const CLIENT_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

/** The endpoint this lane is about, named once. */
const ENDPOINT = "/api/expert-requests";

/** The shared review sheet, and the pure module it delegates every honesty rule to. */
const SHEET = "components/expert-request-review-sheet.tsx";
const RULES = "lib/expert-request-review.ts";

/**
 * THE SURFACE SET — the two doors L19 fixes, each paired with the function that is allowed to
 * hold the write. The pin is over this SET; adding a third surface here is a deliberate human
 * act, and a surface absent from it is unchecked, not exonerated (the D13 posture).
 */
const SURFACES: { file: string; sender: string }[] = [
  { file: "pages/experience-template.tsx", sender: "sendExpertHelpRequest" },
  // Ledger `2026-09-07-concierge-door` (L6): the concierge tier CARDS were retired when
  // `/concierge` became a door into the one plan modal, so the Destination Concierge surface
  // moved from `components/concierge/DeliveryOptions.tsx` (deleted) onto the page itself. The
  // sender kept its name and the invariant is unchanged — the file it lives in is what moved.
  { file: "pages/concierge/index.tsx", sender: "sendExpertRequest" },
];

/**
 * Blank out comments while preserving offsets and line breaks, so a rule written in prose can
 * never satisfy a pin about code and a backward line walk still lands where it should. String
 * and template literals are respected — `https://` inside a URL is not a comment.
 */
function stripComments(src: string): string {
  const out = src.split("");
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; i++; continue; }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (ch === "/" && next === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < src.length) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Every index at which `needle` occurs. Discovery, never a count typed into this file. */
function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return found;
    found.push(at);
    from = at + needle.length;
  }
}

/**
 * The name of the nearest enclosing function/arrow declaration above `index`, found by walking
 * lines backwards for a declaration at an indentation shallower than the matched line's. Static
 * and deliberately simple: it answers "which function is this write in?", which is the whole
 * question this lane turns on.
 */
const DECLARATION =
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function)/;

function enclosingFunction(src: string, index: number): string | null {
  const lines = src.slice(0, index).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = DECLARATION.exec(lines[i]);
    if (m) return m[1] || m[2];
  }
  return null;
}

describe("L19 — the send lives on the review sheet's button, not on the door", () => {
  it("W1 every reach for /api/expert-requests in a surface sits inside that surface's send handler", () => {
    for (const { file, sender } of SURFACES) {
      const src = stripComments(readClient(file));
      const hits = occurrences(src, ENDPOINT);
      assert.ok(
        hits.length > 0,
        `${file}: the endpoint vanished — repair this pin to assert the invariant, never delete it`,
      );
      for (const at of hits) {
        assert.equal(
          enclosingFunction(src, at),
          sender,
          `${file}: a reach for ${ENDPOINT} outside ${sender} — the send must stay on the review sheet's button`,
        );
      }
    }
  });

  it("W2 a surface's slip mint is on the send path too, never on the open", () => {
    // Locked Decision 32: the slip is the precondition FOR the request. Minting one just to
    // open a review screen would write a `trips` row for a request the traveler never sent.
    // Held over the whole SURFACE SET since ledger `2026-09-07-concierge-door`: the concierge
    // surface acquired the same mint when its Expert tier started carrying a real `tripId`, and
    // one rule stated once for both is the point (§18 rule 1). `null` is the import line.
    for (const { file, sender } of SURFACES) {
      const src = stripComments(readClient(file));
      for (const call of ["ensureSlipForExpertRequest(", "mintTripSlip("]) {
        for (const at of occurrences(src, call)) {
          const fn = enclosingFunction(src, at);
          assert.ok(
            fn === sender || fn === null,
            `${file}: ${call} reached from ${fn} — the mint belongs on the send path`,
          );
        }
      }
    }
  });

  it("W3 both surfaces open the SHARED sheet and hand it their own sender", () => {
    for (const { file, sender } of SURFACES) {
      const src = stripComments(readClient(file));
      assert.ok(
        src.includes("ExpertRequestReviewSheet"),
        `${file}: must mount the one shared review sheet, never a second review screen`,
      );
      assert.ok(
        new RegExp(`onSend=\\{${sender}\\}`).test(src),
        `${file}: the sheet's Send must call ${sender}`,
      );
    }
  });

  it("W4 the doors OPEN the review and never call the sender themselves", () => {
    // The template page's three "Get Expert Help" controls share `openExpertChat`; the concierge
    // tier button is inline. Either way the trigger's own handler may not be the sender.
    const template = stripComments(readClient("pages/experience-template.tsx"));
    assert.ok(
      /const openExpertChat = \(\) => \{/.test(template),
      "openExpertChat is the door and is synchronous — an async door is a door that awaits a write",
    );
    assert.ok(template.includes("setExpertReviewOpen(true)"), "the door opens the review");
    for (const at of occurrences(template, "sendExpertHelpRequest")) {
      // The sender's own declaration line is not a call site; every OTHER mention is.
      const lineStart = template.lastIndexOf("\n", at) + 1;
      const lineEnd = template.indexOf("\n", at);
      const line = template.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (DECLARATION.test(line)) continue;
      const fn = enclosingFunction(template, at);
      assert.notEqual(fn, "openExpertChat", "the door must not call the sender");
    }
    // The concierge DOOR moved with ledger `2026-09-07-concierge-door`: the tier cards were
    // retired and the tier choice IS the plan modal's finish, so the control that opens the
    // review is the door's own finish handler. Same invariant, one surface along — the handler
    // may open the review and may record the funnel's chosen tier, and may not send the lead.
    const concierge = stripComments(readClient("pages/concierge/index.tsx"));
    assert.ok(
      /function handlePlanFinish\(/.test(concierge),
      "the concierge door's finish handler is the door — an async door is a door that awaits a write",
    );
    assert.ok(
      concierge.includes("setExpertFinish({ lead: next, plan })"),
      "choosing the local-expert finish opens the review and nothing else",
    );
    for (const at of occurrences(concierge, "sendExpertRequest")) {
      const lineStart = concierge.lastIndexOf("\n", at) + 1;
      const lineEnd = concierge.indexOf("\n", at);
      const line = concierge.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (DECLARATION.test(line)) continue;
      assert.notEqual(
        enclosingFunction(concierge, at),
        "handlePlanFinish",
        "the door must not call the sender",
      );
    }
  });

  it("W5 the sheet itself writes nothing", () => {
    const src = stripComments(readClient(SHEET));
    for (const write of ["fetch(", "apiRequest(", "useMutation"]) {
      assert.ok(!src.includes(write), `the review sheet must not ${write} — it renders and calls onSend`);
    }
    for (const testid of [
      'data-testid="expert-request-review"',
      'data-testid="button-send-expert-request"',
      'data-testid="button-cancel-expert-request"',
    ]) {
      assert.ok(src.includes(testid), `${testid} missing`);
    }
  });

  it("W6 the sheet restates no honesty rule of its own (§18 rule 1)", () => {
    const src = stripComments(readClient(SHEET));
    assert.ok(src.includes("expertRequestPlanRows"), "the rows come from the pure module");
    assert.ok(src.includes("expertRequestRecipientLine"), "the recipient line comes from the pure module");
    assert.ok(
      !/"Not set"/.test(src.replace(/EXPERT_REQUEST_NOT_SET/g, "")),
      "the not-set spelling lives in the module, never re-typed in the JSX",
    );
    assert.ok(
      !src.includes("Intl.NumberFormat"),
      "the sheet formats no price — it renders the line its caller already shows",
    );
  });

  it("W7 the concierge price the sheet shows is the surface's own single derivation", () => {
    // Repaired, not deleted, by ledger `2026-09-07-concierge-door`: the tier CARD that used to
    // render this line was retired with the three-tier chooser, so "the card renders it" is no
    // longer a fact to pin. What survives — and is the reason the pin existed — is that the
    // concierge surface derives the expert price EXACTLY ONCE and HANDS it to the sheet, so the
    // review can never quote a number the surface does not stand behind (§18 rule 1).
    const src = stripComments(readClient("pages/concierge/index.tsx"));
    assert.ok(src.includes("function expertPriceLabel("), "the tier price is resolved once");
    assert.ok(src.includes("priceLabel={expertPriceLabel("), "the sheet is handed that same line");
    assert.equal(
      occurrences(src, "Intl.NumberFormat").length,
      1,
      "one price formatter on the surface — a second is how the sheet and the surface disagree",
    );
  });

  it("W8 the pure module is imported by both the sheet and the free-lead surface", () => {
    const template = stripComments(readClient("pages/experience-template.tsx"));
    assert.ok(
      template.includes("EXPERT_REQUEST_FREE_PRICE"),
      "the free lead rail names its price from the module, never a typed literal",
    );
    assert.ok(readClient(RULES).length > 0, "the pure module exists");
  });
});

describe("§13 — the review states only what the traveler stated", () => {
  it("R1 an unanswered basic is 'Not set', never a guess", () => {
    const rows = expertRequestPlanRows({});
    assert.deepEqual(
      rows.map((r) => [r.label, r.value]),
      [["Destination", null], ["Dates", null], ["Travelers", null]],
    );
    assert.equal(EXPERT_REQUEST_NOT_SET, "Not set");
  });

  it("R2 a blank or whitespace destination is the same answer as an absent one", () => {
    for (const destination of ["", "   ", null, undefined]) {
      const [row] = expertRequestPlanRows({ destination });
      assert.equal(row.value, null, `"${String(destination)}" is not a destination`);
    }
    assert.equal(expertRequestPlanRows({ destination: " Kyoto " })[0].value, "Kyoto");
  });

  it("R3 dates print AS STATED and half an answer is not completed", () => {
    assert.equal(expertRequestDateLine({ startDate: "2026-03-10", endDate: "2026-03-14" }), "2026-03-10 – 2026-03-14");
    assert.equal(expertRequestDateLine({ startDate: "2026-03-10" }), "2026-03-10");
    assert.equal(expertRequestDateLine({ endDate: "2026-03-14" }), "2026-03-14");
    assert.equal(expertRequestDateLine({}), null);
  });

  it("R4 a party of zero is NOT a party, and is never rendered as one", () => {
    assert.equal(expertRequestPartyLine({ party: 0 }), null);
    assert.equal(expertRequestPartyLine({ party: -3 }), null);
    assert.equal(expertRequestPartyLine({ party: Number.NaN }), null);
    assert.equal(expertRequestPartyLine({}), null);
    assert.equal(expertRequestPartyLine({ party: 1 }), "1 traveler");
    assert.equal(expertRequestPartyLine({ party: 4 }), "4 travelers");
  });

  it("R5 the recipient is described, never named — the lead is routed after the send", () => {
    assert.equal(expertRequestRecipientLine("Kyoto, Japan"), "A local expert we match for Kyoto, Japan");
    assert.equal(expertRequestRecipientLine("   "), "A local expert we match for your plan");
    assert.equal(expertRequestRecipientLine(undefined), "A local expert we match for your plan");
  });

  it("R6 the free lead rail says free, because it mints no PaymentIntent", () => {
    assert.equal(EXPERT_REQUEST_FREE_PRICE, "Free request");
  });
});
