/**
 * A production boot must not carry the QA account bypass (ledger `2026-11-27-s5-qa-domain-boot-guard`).
 *
 * `QA_ACCOUNT_EMAIL_DOMAIN` is how a QA-tagged address passes every waitlist pay gate
 * (`server/services/waitlist-purchase-gate.ts:22,30` — `isQaDomainAccount`, so checkout stays testable
 * in waitlist mode). That is right for CI and for staging. In production it is a hole: one environment
 * variable would let those addresses past every one of the eight gates that `2026-11-27-wg1-waitlist-pay-gates`
 * put in front of Stripe.
 *
 * The refusal is a BOOT refusal, not a request refusal: a production process with the domain set does
 * not start at all, so there is no window in which the bypass is live.
 *
 * THE ONE EXEMPTION, and why it is not a loophole: the CI gates boot the PRODUCTION bundle against a
 * throwaway database and rely on the QA domain for their own accounts (`.github/workflows/stay-book-sandbox-gate.yml:93-102`
 * sets `NODE_ENV=production`, `ALLOW_TEST_ACCOUNTS=1` and `QA_ACCOUNT_EMAIL_DOMAIN` together). The
 * `ALLOW_TEST_ACCOUNTS=1` escape is the repo's long-standing marker for exactly that boot
 * (`server/index.ts:613-619`), and it is never set on a real deployment. Refusing on the domain alone
 * would turn every production-bundle gate red without making production safer.
 */

/** The refusal to print at boot, or null when this environment is fine. */
export function qaDomainRefusal(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  const domain = (env.QA_ACCOUNT_EMAIL_DOMAIN ?? "").trim();
  if (!domain) return null;
  // The CI gates' own boot shape: a production bundle, a throwaway database, the QA domain on purpose.
  if (env.ALLOW_TEST_ACCOUNTS === "1") return null;
  return (
    `Refusing to boot: NODE_ENV=production with QA_ACCOUNT_EMAIL_DOMAIN set ("${domain}"). ` +
    "The QA-domain bypass passes those accounts through every waitlist pay gate; unset the variable in production, " +
    "or set ALLOW_TEST_ACCOUNTS=1 when booting a production bundle against a throwaway database."
  );
}
