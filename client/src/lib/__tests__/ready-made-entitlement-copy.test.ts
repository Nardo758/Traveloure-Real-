/**
 * READY-MADE ENTITLEMENT COPY — a ready-made purchase includes ONE asynchronous REVISION, and
 * every buyer-facing surface says exactly that. Decision-maker ruling 2026-09-15 (punchlist
 * **D-2**, option A); ledger `2026-09-15-d2-one-revision-not-a-consultation`; CLAUDE.md §13,
 * §18 rule 1.
 *
 * WHY THIS EXISTS. The "included consultation" was copy with nothing behind it: the purchase row
 * (`ready_made_purchases`) stores `revision_status` / `revision_request_note` /
 * `revision_requested_at` and **no consultation column at all**, the revision half has a rail
 * (`POST /api/ready-made/purchases/:id/request-revision`) and the consultation half has no
 * storage, no scheduling and no endpoint. A promise a surface can make but the platform cannot
 * keep is the §13 lie this pin exists to prevent, and it is INVISIBLE to every other kind of
 * test — nothing goes red when a page offers something no rail delivers.
 *
 * What these hold:
 *   D1  the listing detail's inclusion promise names the revision and never a consultation.
 *   D2  the buy card's included-with list names the revision and never a consultation.
 *   D3  the buyer's slip card (`ConciergeCard`) offers exactly the revision.
 *   D4  the SWEEP — no ready-made buyer surface in `client/src` says "consult" in its CODE.
 *       The file set is DERIVED by walking `client/src` for the ready-made surfaces' own
 *       filenames, never a hand-copied list with a hand-copied count.
 *
 * NEGATIVE SPACE, stated because green here is green-within-bounds: this reads CLIENT source
 * only. The buyer purchase EMAIL is pinned server-side by `ready-made-clone-fields.db.test.ts`
 * R1 (which forbids "consult" in the sent body), and the EXPERT consult listings — real bookable
 * advisory services (`impact-class` `consult`, `expert_offering_types` advisory tier) — are a
 * different product and are deliberately OUT of this predicate: the sweep is scoped to the
 * ready-made files, never to the word wherever it appears.
 *
 * Pure static source pins: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/ready-made-entitlement-copy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

/**
 * Strip comments before a word grep. The ruling is EXPLAINED in comments at each surface it
 * touched — that is how the next reader learns why the consultation is gone — so a naive
 * `includes()` over the raw file would be satisfied by the explanation, and the absence pin
 * would pass on a page that had put the promise back. The pin has to read the CODE.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeClient = (rel: string) => stripComments(readClient(rel));

const CONSULT = /consult/i;
const REVISION = /revision/i;

const DETAIL = "pages/ready-made-detail.tsx";
const CARD = "components/marketplace/concierge-card.tsx";

/**
 * The JSX slice a `data-testid` names, from the element that carries it to the end of the file's
 * next blank-line-delimited block. Deliberately crude and deliberately GENEROUS: a slice that is
 * too wide can only make the absence assertion harder to pass, never easier.
 */
function blockAfterTestId(src: string, testId: string): string {
  const at = src.indexOf(`data-testid="${testId}"`);
  assert.ok(at >= 0, `the surface still carries data-testid="${testId}" (if it was renamed, repair this pin)`);
  return src.slice(at, at + 900);
}

/** Every `.ts`/`.tsx` under `client/src` whose path names a ready-made buyer surface. */
function readyMadeSurfaceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      // The ready-made buyer surfaces name themselves: the store listing/detail/cards, and the
      // purchase's own entitlement card on the slip.
      if (/ready-made|concierge-card/i.test(entry)) out.push(relative(CLIENT_SRC, full));
    }
  };
  walk(CLIENT_SRC);
  return out.sort();
}

describe("ready-made entitlement copy — one revision, and no consultation anywhere", () => {
  it("D1 the listing detail's inclusion promise is the revision alone", () => {
    const block = blockAfterTestId(codeClient(DETAIL), "text-concierge-promise");
    assert.match(block, REVISION, "the promise names the revision the purchase row actually stores");
    assert.doesNotMatch(
      block,
      CONSULT,
      "the promise must never offer a consultation — no column, no rail, no scheduling exists for one",
    );
  });

  it("D2 the buy card's included-with list never offers a consultation", () => {
    const src = codeClient(DETAIL);
    const at = src.indexOf("button-buy-rm");
    assert.ok(at >= 0, "the buy CTA is still on the detail page (if it was renamed, repair this pin)");
    const buyCard = src.slice(at, at + 1600);
    assert.match(buyCard, REVISION, "the buy card states the one thing the purchase includes");
    assert.doesNotMatch(buyCard, CONSULT, "and never sells a consultation beside it");
  });

  it("D3 the buyer's slip card offers exactly the revision", () => {
    const src = codeClient(CARD);
    assert.match(src, /request-revision/, "the card's action is the revision rail that exists");
    assert.doesNotMatch(src, CONSULT, "and the card lists no consultation");
    // §13: the card is the buyer's read-out of the ENTITLEMENT, so it reads the stored status —
    // it never restates an entitlement of its own.
    assert.match(src, /revisionStatus/, "the card renders from `ready_made_purchases.revision_status`");
  });

  it("D4 no ready-made buyer surface in client/src says 'consult' in its code", () => {
    const files = readyMadeSurfaceFiles();
    // The SET, not a count: this fails the day someone adds a ready-made surface that sells one.
    assert.ok(files.length >= 2, `expected the ready-made surfaces to be found; got ${files.join(", ")}`);
    assert.ok(files.includes(DETAIL), `the listing detail is in the swept set (got ${files.join(", ")})`);
    assert.ok(files.includes(CARD), `the slip's entitlement card is in the swept set (got ${files.join(", ")})`);
    for (const rel of files) {
      assert.doesNotMatch(
        codeClient(rel),
        CONSULT,
        `${rel} offers a consultation the ready-made rail cannot deliver (punchlist D-2 ruled it is one revision)`,
      );
    }
  });
});
