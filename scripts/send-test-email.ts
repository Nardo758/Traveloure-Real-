/**
 * Test script — verifies the sendEmail integration end-to-end.
 *
 * Usage:
 *   TEST_EMAIL=you@example.com npx tsx scripts/send-test-email.ts
 *
 * Required env vars (must be set in Replit Secrets or shell before running):
 *   RESEND_API_KEY, EMAIL_FROM_NOREPLY, EMAIL_REPLY_TO, TEST_EMAIL
 */

import { sendEmail } from "../server/services/email.service";

async function main() {
  const to = process.env.TEST_EMAIL;
  if (!to) {
    console.error("ERROR: TEST_EMAIL env var is not set. Aborting.");
    process.exit(1);
  }

  console.log(`[test] Sending test email to ${to} …`);

  const result = await sendEmail({
    to,
    subject: "Traveloure — transactional email test",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">✅ Traveloure email delivery test</h2>
        <p>This is an automated test sent from <code>scripts/send-test-email.ts</code>.</p>
        <p>If you received this, <strong>Resend is configured correctly</strong> and the
           centralised <code>sendEmail()</code> module is working end-to-end.</p>
        <p style="color:#9CA3AF;font-size:12px;margin-top:32px">
          Sent at ${new Date().toUTCString()}
        </p>
      </div>
    `,
    text: [
      "Traveloure — transactional email test",
      "",
      "This is an automated test sent from scripts/send-test-email.ts.",
      "If you received this, Resend is configured correctly and the",
      "centralised sendEmail() module is working end-to-end.",
      "",
      `Sent at ${new Date().toUTCString()}`,
    ].join("\n"),
  });

  if (result.ok) {
    console.log(`[test] SUCCESS — message id: ${result.id}`);
  } else {
    console.error(`[test] FAILED — error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test] Unhandled error:", err);
  process.exit(1);
});
