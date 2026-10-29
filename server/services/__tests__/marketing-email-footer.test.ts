/**
 * Marketing-email footer (ledger `2026-10-20-marketing-email-footer`).
 * Placeholder values below are fake. They are not a company address.
 */
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import {
  MARKETING_EMAIL_FOOTER_FIELDS,
  marketingEmailFooterFromValues,
  marketingFooterSkipReason,
  type MarketingEmailFooterKey,
} from "@shared/marketing-email-footer";
import { db } from "../../db";
import { emailOutbox, itineraryComparisons, users } from "@shared/schema";
import { buildBookingConfirmationEmailPayload } from "../email.service";
import { buildItineraryFollowupEmail } from "../itinerary-followup-email";
import { deliverItineraryFollowup } from "../itinerary-followup.service";
import { applyMarketingEmailFooter, readMarketingEmailFooter } from "../marketing-email-footer";
import { buildWaitlistOpenEmail, composeWaitlistOpenEmail } from "../waitlist-open-email";

const FAKE: Record<MarketingEmailFooterKey, string> = {
  marketing_email_sender_name: "Example Sender LLC",
  marketing_email_opt_out_address: "opt-out@example.test",
  marketing_email_postal_address: "CONFIGURED-POSTAL-LINE-1\nCONFIGURED-POSTAL-LINE-2",
  marketing_email_complaint_contact: "complaints@example.test",
};

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

async function rememberFooter() {
  const prior = new Map<MarketingEmailFooterKey, string | null>();
  for (const field of MARKETING_EMAIL_FOOTER_FIELDS) {
    const result = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${field.key}`);
    prior.set(field.key, (result.rows[0] as { setting_value?: string } | undefined)?.setting_value ?? null);
  }
  return prior;
}

async function writeFooter(values: Partial<Record<MarketingEmailFooterKey, string | null>>) {
  for (const field of MARKETING_EMAIL_FOOTER_FIELDS) {
    const value = values[field.key];
    if (value == null || value === "") {
      await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${field.key}`);
    } else {
      await db.execute(sql`
        INSERT INTO platform_settings (setting_key, setting_value, updated_at)
        VALUES (${field.key}, ${value}, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
      `);
    }
  }
}

async function restoreFooter(prior: Map<MarketingEmailFooterKey, string | null>) {
  for (const field of MARKETING_EMAIL_FOOTER_FIELDS) {
    const value = prior.get(field.key);
    if (value == null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${field.key}`);
    else await db.execute(sql`
      INSERT INTO platform_settings (setting_key, setting_value, updated_at)
      VALUES (${field.key}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
    `);
  }
}

test("a blank or missing setting is a skip reason and not a partial footer", () => {
  const none = marketingEmailFooterFromValues({});
  assert.equal(none.ok, false);
  if (!none.ok) {
    assert.deepEqual(none.missing, MARKETING_EMAIL_FOOTER_FIELDS.map((field) => field.key));
    assert.equal(none.reason, marketingFooterSkipReason(none.missing));
  }
  const whitespace = marketingEmailFooterFromValues({
    ...FAKE,
    marketing_email_postal_address: "  \n  ",
  });
  assert.equal(whitespace.ok, false);
  if (!whitespace.ok) {
    assert.deepEqual(whitespace.missing, ["marketing_email_postal_address"]);
    assert.equal(whitespace.reason.includes("Example"), false);
    assert.equal(whitespace.reason.includes(FAKE.marketing_email_opt_out_address), false);
  }
  assert.equal(applyMarketingEmailFooter({
    html: "<p>Hi</p>", text: "Hi", unsubscribeUrl: "  ",
  }, marketingEmailFooterFromValues(FAKE).ok ? (marketingEmailFooterFromValues(FAKE) as { ok: true; footer: import("@shared/marketing-email-footer").MarketingEmailFooter }).footer : null as never), null);
});

test("the footer writes every configured value and keeps the existing unsubscribe link", () => {
  const parsed = marketingEmailFooterFromValues(FAKE);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const base = buildItineraryFollowupEmail({
    kind: "itinerary_nudge_2h", itineraryId: "plan-1", firstName: "QA", destination: "Exampleville",
    baseUrl: "https://app.example.test", unsubscribeToken: "token-1", bookable: true,
  })!;
  const message = applyMarketingEmailFooter(base, parsed.footer)!;
  assert.match(message.html, /Unsubscribe from itinerary follow-up emails/);
  assert.match(message.html, /Sender: Example Sender LLC/);
  assert.match(message.html, />opt-out@example\.test</);
  assert.match(message.text, /Opt out by email: opt-out@example\.test/);
  assert.match(message.html, /CONFIGURED-POSTAL-LINE-1<br>CONFIGURED-POSTAL-LINE-2/);
  assert.match(message.text, /CONFIGURED-POSTAL-LINE-1\nCONFIGURED-POSTAL-LINE-2/);
  assert.match(message.html, /Complaints: complaints@example\.test/);
  assert.match(message.html, /href="https:\/\/app\.example\.test\/email-preferences\/unsubscribe\/token-1"/);
  assert.match(message.text, /Unsubscribe: https:\/\/app\.example\.test\/email-preferences\/unsubscribe\/token-1/);
  const escaped = applyMarketingEmailFooter({
    html: "<p>Hi</p>", text: "Hi", unsubscribeUrl: "https://app.example.test/unsub",
  }, { ...parsed.footer, senderName: "<QA & Co>" })!;
  assert.match(escaped.html, /Sender: &lt;QA &amp; Co&gt;/);
  assert.doesNotMatch(escaped.html, /<QA & Co>/);
});

test("the waitlist open mail uses the same footer and a transactional booking mail does not", () => {
  const parsed = marketingEmailFooterFromValues(FAKE);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const open = buildWaitlistOpenEmail({
    cityName: "Exampleville",
    unsubscribeUrl: "https://app.example.test/email-preferences/unsubscribe/token-open",
    footer: parsed.footer,
  })!;
  assert.match(open.subject, /We're open in Exampleville/);
  assert.match(open.html, /Unsubscribe from waitlist emails/);
  assert.match(open.html, /Opt out by email:/);
  assert.match(open.text, /Sender: Example Sender LLC/);
  assert.equal(buildWaitlistOpenEmail({ cityName: " ", unsubscribeUrl: "https://app.example.test/u", footer: parsed.footer }), null);
  const booking = buildBookingConfirmationEmailPayload({
    toEmail: "traveler@example.test", userName: "QA", bookingId: "booking-1",
    bookingTitle: "Example walk", confirmationCode: "CODE",
  });
  assert.doesNotMatch(booking.html, /Opt out by email/);
  assert.doesNotMatch(booking.text, /Sender: Example Sender LLC/);
});

test("marketing automations are the three follow-ups, and both marketing senders read the footer", () => {
  const marketing = walk(join(root, "server/automations"))
    .filter((file) => /type:\s*"marketing"/.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(root.length + 1));
  assert.deepEqual(marketing, ["server/automations/messaging/_itinerary-followup-definition.ts"]);
  const followup = readFileSync(join(root, "server/services/itinerary-followup.service.ts"), "utf8");
  assert.match(followup, /readMarketingEmailFooter/);
  assert.match(followup, /applyMarketingEmailFooter/);
  assert.match(followup, /logMarketingEmailSkip/);
  assert.doesNotMatch(followup, /Traveloure LLC/);
  const open = readFileSync(join(root, "server/services/waitlist-open-email.ts"), "utf8");
  assert.match(open, /readMarketingEmailFooter/);
  assert.match(open, /applyMarketingEmailFooter/);
  const transactional = readFileSync(join(root, "server/services/email.service.ts"), "utf8");
  assert.doesNotMatch(transactional, /marketing-email-footer/);
});

test("a marketing send is skipped until every setting is stored, then the stub receives the footer", async () => {
  const prior = await rememberFooter();
  const userId = randomUUID();
  const itineraryId = randomUUID();
  const email = `footer-${userId}@example.test`;
  const previousInbox = process.env.ITINERARY_OUTCOME_TEST_EMAIL;
  process.env.ITINERARY_OUTCOME_TEST_EMAIL = email;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  let outboxId = 0;
  try {
    await writeFooter({});
    await db.insert(users).values({
      id: userId, email, firstName: "QA",
      preferences: { itineraryMarketing: { enabled: true, timeZone: "UTC", quietStart: "00:00", quietEnd: "00:00" } },
    });
    await db.insert(itineraryComparisons).values({
      id: itineraryId, userId, destination: null, status: "generated",
    });
    const metadata = {
      travelerFollowupVersion: 1 as const, marketing: true, travelerId: userId, itineraryId,
      readyAt: new Date().toISOString(), unsubscribeToken: randomUUID(),
    };
    const [row] = await db.insert(emailOutbox).values({
      emailType: "itinerary_nudge_2h", toEmail: email, subject: "Itinerary follow-up", html: "",
      status: "processing", metadata,
    }).returning({ id: emailOutbox.id });
    outboxId = row.id;
    const send = async () => ({ ok: true, id: "must-not-send" });
    assert.equal(await deliverItineraryFollowup(outboxId, send), "skipped");
    const [held] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId));
    assert.equal(held.status, "pending");
    assert.equal(held.attemptCount, 0);
    assert.match(held.lastError ?? "", /marketing_email_sender_name/);
    assert.match(held.lastError ?? "", /marketing_email_postal_address/);
    assert.equal((held.lastError ?? "").includes("@"), false);
    assert.ok(warnings.some((line) => line.includes(`[marketing-email] skipped itinerary_nudge_2h outbox=${outboxId}`)));

    const openSkipped = await composeWaitlistOpenEmail({
      cityName: "Exampleville", unsubscribeUrl: "https://app.example.test/unsub",
    });
    assert.equal(openSkipped.ok, false);
    if (!openSkipped.ok) assert.match(openSkipped.reason, /marketing_email_opt_out_address/);

    await writeFooter(FAKE);
    const loaded = await readMarketingEmailFooter();
    assert.equal(loaded.ok, true);
    await db.update(emailOutbox).set({ status: "processing", retryAfter: new Date(Date.now() + 600_000) }).where(eq(emailOutbox.id, outboxId));
    let payloadHtml = "";
    assert.equal(await deliverItineraryFollowup(outboxId, async (params) => {
      payloadHtml = params.html;
      return { ok: true, id: "stub-followup" };
    }), "sent");
    assert.match(payloadHtml, /Sender: Example Sender LLC/);
    assert.match(payloadHtml, /opt-out@example\.test/);
    assert.match(payloadHtml, /Unsubscribe from itinerary follow-up emails/);
    const open = await composeWaitlistOpenEmail({
      cityName: "Exampleville", unsubscribeUrl: "https://app.example.test/unsub",
    });
    assert.equal(open.ok, true);
    if (open.ok) {
      assert.match(open.text, /Complaints: complaints@example\.test/);
      assert.match(open.html, /CONFIGURED-POSTAL-LINE-1/);
    }
  } finally {
    console.warn = originalWarn;
    if (previousInbox == null) delete process.env.ITINERARY_OUTCOME_TEST_EMAIL;
    else process.env.ITINERARY_OUTCOME_TEST_EMAIL = previousInbox;
    if (outboxId) await db.delete(emailOutbox).where(eq(emailOutbox.id, outboxId));
    await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, itineraryId));
    await db.delete(users).where(eq(users.id, userId));
    await restoreFooter(prior);
  }
});
