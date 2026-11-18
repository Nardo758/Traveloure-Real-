#!/usr/bin/env node
/**
 * F12 - IS A REQUIRED WORKFLOW'S RUN A RUN?
 *
 * The zero-jobs class (#2046 run 44181575719, #2047 run 44332764964): a workflow that does not PARSE makes
 * GitHub create the run and no jobs, so the required contexts are absent and "a run exists" proved nothing.
 *
 * THREE FACTS, THREE ANSWERS - a zero job count means different things at different moments:
 *   queued / in_progress + 0 jobs  -> "pending"       NOT a parse failure. GitHub creates the run first and
 *                                                      the jobs when a runner picks them up, so a fresh head
 *                                                      legitimately shows zero jobs for a while.
 *   completed + 0 jobs             -> "unparsed"      the failure this lane exists for.
 *   completed / queued + jobs > 0  -> "ran"
 *   the jobs lookup itself failed  -> "lookup-failed" FAILS CLOSED, matching what this guard already does when
 *                                                      it cannot read the run list at all: an unreadable signal
 *                                                      is never treated as a pass, because that is how a dead
 *                                                      workflow would slip through.
 */
const VERDICTS = ["ran", "pending", "unparsed", "lookup-failed"];

function judgeRun(input) {
  const { status, totalJobs } = input || {};
  if (input && input.lookupFailed) return "lookup-failed";
  const jobs = typeof totalJobs === "number" ? totalJobs : totalJobs === "" || totalJobs == null ? null : Number(totalJobs);
  if (jobs === null || Number.isNaN(jobs)) return "lookup-failed";
  if (jobs > 0) return "ran";
  // zero jobs: a completed run that created none did not parse; one still queued may simply not have started.
  return status === "completed" ? "unparsed" : "pending";
}

/** `judge --status <status> --jobs <n|"">` - prints the verdict; exit 1 only for unparsed / lookup-failed. */
function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const status = get("--status") ?? "";
  const raw = get("--jobs");
  const verdict = judgeRun({
    status,
    totalJobs: raw === undefined ? null : raw === "" ? null : Number(raw),
  });
  console.log(verdict);
  process.exit(verdict === "unparsed" || verdict === "lookup-failed" ? 1 : 0);
}

function selfTest() {
  const cases = [
    ["completed + zero jobs is a parse failure", { status: "completed", totalJobs: 0 }, "unparsed"],
    ["queued + zero jobs is NOT a parse failure", { status: "queued", totalJobs: 0 }, "pending"],
    ["in_progress + zero jobs is NOT a parse failure", { status: "in_progress", totalJobs: 0 }, "pending"],
    ["completed + jobs ran", { status: "completed", totalJobs: 7 }, "ran"],
    ["queued + jobs already created", { status: "queued", totalJobs: 3 }, "ran"],
    ["a failed lookup is its own answer", { status: "completed", totalJobs: null }, "lookup-failed"],
    ["an unreadable count is a lookup failure", { status: "completed", totalJobs: Number.NaN }, "lookup-failed"],
    ["an explicit lookupFailed flag wins", { status: "completed", totalJobs: 4, lookupFailed: true }, "lookup-failed"],
  ];
  let failed = 0;
  for (const [label, input, want] of cases) {
    const got = judgeRun(input);
    const ok = got === want && VERDICTS.includes(got);
    if (!ok) {
      failed += 1;
      console.error(`  SELF-TEST FAIL (expected ${want}, got ${got}): ${label}`);
    } else {
      console.log(`  ok  ${got} - ${label}`);
    }
  }
  if (failed) {
    console.error(`required-suite-verdict self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log(`required-suite-verdict self-test: ${cases.length} cases`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { judgeRun, VERDICTS };
