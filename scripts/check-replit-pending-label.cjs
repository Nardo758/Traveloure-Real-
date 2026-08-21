#!/usr/bin/env node
/**
 * replit-pending label gate predicate (Trailhead lane C, guard C2).
 *
 * FAILS while a PR carries a `⚑ replit-pending` (or plain `replit-pending`)
 * label, and PASSES once the label is removed — so "merged ≠ verified" is
 * self-enforcing. Two gates were jumped by momentum this quarter (a merge
 * landed while its Replit-side verification was still outstanding); a required
 * check that stays red until the label is cleared makes that impossible to do
 * by accident.
 *
 * THE LABEL NAME. The gate matches a label whose name, after stripping the
 * leading ⚑ flag emoji and surrounding whitespace and lowercasing, equals
 * exactly `replit-pending`. So both `⚑ replit-pending` and `replit-pending`
 * trip it; nothing else does. A repo admin must create the label in
 * Settings → Labels (either spelling) and apply it to a PR whose Replit-side
 * verification is still outstanding; removing it turns this check green.
 *
 * INPUT. Label names arrive as a JSON array on argv[2] or in $PR_LABELS_JSON,
 * e.g. '["⚑ replit-pending","bug"]'. The workflow fills it from the PR event.
 *
 * --self-test (§18d): proves the predicate flags both spellings and passes on
 * an unlabeled / unrelated-label PR, before its verdict on a real PR is trusted.
 * Node built-ins only — no npm ci needed.
 */
const CANONICAL = "replit-pending";
// Strip a leading ⚑ (U+2691) flag and any surrounding whitespace, then lowercase.
function normalize(name) {
  return String(name).replace(/⚑/g, "").trim().toLowerCase();
}

/** @returns {{pending: boolean, matched: string[]}} */
function evaluate(labelNames) {
  const matched = (labelNames || []).filter((n) => normalize(n) === CANONICAL);
  return { pending: matched.length > 0, matched };
}

function parseLabels(raw) {
  if (!raw || !raw.trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error(`FAIL  Could not parse label JSON: ${e.message}\n      Received: ${raw.slice(0, 200)}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed)) {
    console.error("FAIL  Label input must be a JSON array of label-name strings.");
    process.exit(2);
  }
  // Accept both ["name", ...] and [{name: "..."}, ...] shapes.
  return parsed.map((x) => (x && typeof x === "object" ? x.name : x)).filter((x) => x != null);
}

function selfTest() {
  const cases = [
    { in: ["⚑ replit-pending"], pending: true, note: "flag-emoji spelling" },
    { in: ["replit-pending"], pending: true, note: "plain spelling" },
    { in: ["⚑ Replit-Pending"], pending: true, note: "case-insensitive + flag" },
    { in: ["bug", "⚑ replit-pending", "enhancement"], pending: true, note: "among other labels" },
    { in: [{ name: "replit-pending" }], pending: true, note: "object-shaped label" },
    { in: [], pending: false, note: "no labels" },
    { in: ["bug", "needs-review"], pending: false, note: "unrelated labels" },
    { in: ["replit"], pending: false, note: "substring must NOT match" },
    { in: ["replit-pending-review"], pending: false, note: "superstring must NOT match" },
  ];
  const problems = [];
  for (const c of cases) {
    const { pending } = evaluate(c.in.map((x) => (x && typeof x === "object" ? x.name : x)));
    if (pending !== c.pending) {
      problems.push(`  - expected pending=${c.pending} for [${c.note}], got ${pending}`);
    }
  }
  if (problems.length) {
    console.error("SELF-TEST FAILED");
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(`self-test OK (${cases.length} label fixtures: both spellings fail, unrelated/absent pass, no sub/superstring match)`);
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const raw = process.argv[2] || process.env.PR_LABELS_JSON || "";
const names = parseLabels(raw);
const { pending, matched } = evaluate(names);
if (pending) {
  console.error(
    `FAIL  This PR carries a "${matched[0]}" label — Replit-side verification is still outstanding.\n` +
      `      "merged ≠ verified": remove the ${CANONICAL} label once the Replit verification is done to turn this check green.`
  );
  process.exit(1);
}
console.log(`replit-pending label gate OK (no ${CANONICAL} label present)`);
