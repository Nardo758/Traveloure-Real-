/** Launch item 12: the staging QA seed's gate, pure (no database import) so it can be tested alone. */
export type StagingQaGate = { run: true } | { run: false; reason: string };

/** Pure: may the staging QA seed write? Every refusal names its reason. */
export function stagingQaSeedGate(env: NodeJS.ProcessEnv = process.env): StagingQaGate {
  if ((env.ENVIRONMENT ?? "").trim().toUpperCase() === "PROD") return { run: false, reason: "ENVIRONMENT=PROD" };
  if (env.NODE_ENV === "production" && env.ALLOW_TEST_ACCOUNTS !== "1") return { run: false, reason: "production without ALLOW_TEST_ACCOUNTS=1" };
  const pw = env.STAGING_QA_PASSWORD ?? "";
  if (pw.length < 12) return { run: false, reason: "STAGING_QA_PASSWORD unset or shorter than 12 characters" };
  return { run: true };
}

