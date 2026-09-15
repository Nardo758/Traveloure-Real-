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
 * WHY IT ALSO HOLDS D-3. The same question, one ruling later: a ready-made trip and a service
 * booking are NEVER mixed in one checkout (decision-maker ruling 2026-09-15, punchlist **D-3**,
 * option A; ledger `2026-09-15-d3-readymade-separate-checkout`). The ready-made purchase is its own
 * PaymentIntent against `ready_made_trips`; the bookable services inside the plan are reservations
 * the buyer carts separately at their own listing price (Locked Decision 39 — the cart is the
 * `ready_for_checkout` projection of `itinerary_items`, and a cloned item is born `in_planning`
 * carrying no booking at all). So no store surface may imply the price covers them. That is the
 * SAME class of §13 lie as D-2's: a promise the surface can make and the platform cannot keep,
 * invisible to every other kind of test because no rail goes red when a page over-promises.
 *
 * What these hold:
 *   D1  the listing detail's inclusion promise names the revision and never a consultation.
 *   D2  the buy card's included-with list names the revision and never a consultation.
 *   D3  the buyer's slip card (`ConciergeCard`) offers exactly the revision.
 *   D4  the SWEEP — no ready-made buyer surface in `client/src` says "consult" in its CODE.
 *       The file set is DERIVED by walking `client/src` for the ready-made surfaces' own
 *       filenames, never a hand-copied list with a hand-copied count.
 *   D5  the detail page's contents block states the separation and never claims inclusion.
 *   D6  the detail page's PRICE block (caption + buy card) says what the price buys.
 *   D7  the STORE card — the tile that puts a price badge beside an "N items" chip — carries the
 *       separation line beside them.
 *   D8  the SWEEP — no ready-made buyer surface's CODE claims the price includes the bookings.
 *       The file set here is derived differently on purpose: every `client/src` file whose code
 *       links to the `/ready-made/:id` detail route, which is what a ready-made BUYER surface is
 *       by construction (the store card lives inside `discover.tsx`, so a filename walk would
 *       miss exactly the tile that raised D-3).
 *
 * NEGATIVE SPACE, stated because green here is green-within-bounds: this reads CLIENT source
 * only. The buyer purchase EMAIL is pinned server-side by `ready-made-clone-fields.db.test.ts`
 * R1 (which forbids "consult" in the sent body and, since D-3, requires the separation), and the
 * EXPERT consult listings — real bookable advisory services (`impact-class` `consult`,
 * `expert_offering_types` advisory tier) — are a different product and are deliberately OUT of this
 * predicate: the sweep is scoped to the ready-made files, never to the word wherever it appears.
 * D5–D8 read SOURCE TEXT, so they can see that a surface states the separation and that it states
 * no inclusion claim in the forms listed; they cannot see a NEW form of the claim nobody wrote
 * down, and they say nothing about the SLIP, where a cloned item's "not booked" answer is the
 * existing routing pill rendering `routingStatus: "in_planning"` with no booking — a render this
 * lane deliberately did not change and therefore does not re-pin here.
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

/**
 * D-3. The SEPARATION is the word the ruling requires a surface to say out loud: the price buys the
 * plan, and the things inside it are bought separately. Matched loosely on purpose — the sentence
 * is written in each surface's own voice and must stay free to be reworded.
 */
const SEPARATELY = /separately/i;

/**
 * D-3's forbidden claims: the forms in which a surface would tell a buyer the plan's price covers
 * the bookings inside it. This is a DENYLIST and it is stated as one — it catches the phrasings
 * that exist and the near neighbours of them, never a new sentence nobody has written yet. That
 * limit is why D5–D7 also REQUIRE the separation rather than only forbidding its opposite: a
 * surface that says the true thing cannot be silently replaced by one that says nothing.
 */
const INCLUSION_CLAIMS: { re: RegExp; why: string }[] = [
  { re: /all[- ]inclusive/i, why: "a ready-made price covers no reservation at all" },
  { re: /\b(bookings?|reservations?|stays?|tours?|services?)\s+(are\s+)?included\b/i,
    why: "the bookings inside the plan are a separate purchase on a separate rail" },
  { re: /\bincludes?\s+(all\s+)?(your\s+)?(bookings?|reservations?|stays?|tours?|hotels?|flights?)\b/i,
    why: "the ready-made PaymentIntent pays the author for the plan, nothing else" },
  { re: /\beverything\s+(is\s+)?(included|booked)\b/i, why: "nothing in a bought plan is booked" },
];

const DETAIL = "pages/ready-made-detail.tsx";
const CARD = "components/marketplace/concierge-card.tsx";
/** The STORE card (`ReadyMadeThemeCard`) lives inside the Discover page, not in a file of its own. */
const STORE = "pages/discover.tsx";

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

/**
 * D-3's file set: every `.ts`/`.tsx` under `client/src` whose CODE links to the ready-made detail
 * route. That is what a ready-made BUYER surface is by construction — a tile, card or page that
 * sends someone to a listing — and it is derived rather than listed because the surface that raised
 * D-3 (the store card, `ReadyMadeThemeCard`) lives inside `discover.tsx` and a filename walk misses
 * it. Seller/admin surfaces that also link there are swept too; the sweep is a NEGATIVE assertion,
 * so a wider set can only make it stricter.
 */
function readyMadeLinkingFiles(): string[] {
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
      const rel = relative(CLIENT_SRC, full);
      if (/\/ready-made\/\$\{|"\/ready-made\/|'\/ready-made\//.test(codeClient(rel))) out.push(rel);
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

describe("ready-made checkout separation — the price buys the plan, not the bookings inside it", () => {
  it("D5 the detail page's contents block states the separation and claims no inclusion", () => {
    const src = codeClient(DETAIL);
    const block = blockAfterTestId(src, "text-separate-bookings");
    assert.match(block, SEPARATELY, "the contents block says the bookings are booked separately");
    assert.match(
      block,
      /price|plan/i,
      "and says what the price does buy, so the sentence is a statement rather than a disclaimer",
    );
    // The heading over the counts must not be the word that caused the problem: "What's included"
    // beside a price reads as "your $X covers these", which no rail delivers.
    const headingAt = src.indexOf("<RmSectionHeading>");
    assert.ok(headingAt >= 0, "the page still uses RmSectionHeading (if renamed, repair this pin)");
    assert.doesNotMatch(
      src,
      /<RmSectionHeading>What's included<\/RmSectionHeading>/,
      "the contents heading must not claim inclusion — it counts what the plan plans, not what the price covers",
    );
  });

  it("D6 the price block says what the price buys, on both the caption and the buy card", () => {
    const src = codeClient(DETAIL);
    const caption = blockAfterTestId(src, "text-rm-price-caption");
    assert.match(caption, /plan/i, "the caption beside the number names the plan as what it buys");
    const buyCardLine = blockAfterTestId(src, "text-buy-card-separate");
    assert.match(buyCardLine, SEPARATELY, "the included-with list ends by naming what is NOT included");
  });

  it("D7 the store card carries the separation beside its price badge and items chip", () => {
    const src = codeClient(STORE);
    // The tile is the one that puts the two next to each other, so the pin asserts both are still
    // there — if either moves, the line's placement needs a human, not a silently passing test.
    assert.match(src, /rm-shelf-card-/, "the store card is still in this file (if it moved, repair this pin)");
    assert.match(src, /\{itemCount\} items/, "the tile still states a contents count beside the price");
    // The tile's testid is INTERPOLATED (`rm-shelf-separate-${l.id}`), so it is found by prefix
    // rather than by the exact-attribute helper D1–D3 use.
    const at = src.indexOf("rm-shelf-separate-");
    assert.ok(at >= 0, "the store card carries the separation line (if its testid was renamed, repair this pin)");
    assert.match(src.slice(at, at + 400), SEPARATELY, "and it says the recommended things are booked separately");
  });

  it("D8 no ready-made buyer surface claims the price includes the bookings", () => {
    const files = readyMadeLinkingFiles();
    // The SET, not a count.
    assert.ok(files.includes(DETAIL), `the listing detail links to its own route (got ${files.join(", ")})`);
    assert.ok(files.includes(STORE), `the store card's page is in the swept set (got ${files.join(", ")})`);
    assert.ok(
      files.includes("components/feed/ready-made-card.tsx"),
      `the feed tile is in the swept set (got ${files.join(", ")})`,
    );
    for (const rel of files) {
      const src = codeClient(rel);
      for (const { re, why } of INCLUSION_CLAIMS) {
        assert.doesNotMatch(src, re, `${rel} implies the ready-made price includes the bookings — ${why}`);
      }
    }
  });
});
