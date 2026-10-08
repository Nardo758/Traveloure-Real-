// Read-only provider proof. No sends; IDs/statuses/content equality only.
import fs from "node:fs";
import { Resend } from "resend";
import { loadOwner } from "./automation-open-fixtures.mjs";
const owner = loadOwner(), client = new Resend(process.env.RESEND_API_KEY);
const captures = JSON.parse(fs.readFileSync(owner.mailPath, "utf8"));
const clockPath = `/tmp/automation-clock-mail-${owner.schema}.jsonl`;
if (fs.existsSync(clockPath)) captures.push(...fs.readFileSync(clockPath, "utf8").trim().split("\n").filter(Boolean).map(s => JSON.parse(s)));
const unique = [...new Map(captures.map(m => [m.providerId, m])).values()], receipts = [];
for (const mail of unique) {
  await new Promise(r => setTimeout(r, 1250));
  const response = await client.emails.get(mail.providerId);
  receipts.push({ providerId: mail.providerId, loop: mail.loop ?? "real-clock", accountKind: mail.accountKind ?? "clock",
    checkedAt: new Date().toISOString(), event: response.data?.last_event ?? "NOT_CONFIRMED",
    htmlMatchesIssuedPayload: response.data?.html === mail.html,
    textMatchesIssuedPayload: response.data?.text === (mail.text ?? null),
    providerConfirmedDelivered: ["delivered", "opened", "clicked"].includes(response.data?.last_event),
    providerError: response.error ? "PROVIDER_READ_FAILED" : null });
}
fs.writeFileSync("reports/automation-part1-evidence/open-provider-receipts.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), receipts }, null, 2));
console.log(JSON.stringify({ receipts: receipts.length, delivered: receipts.filter(r => r.providerConfirmedDelivered).length,
  htmlMatches: receipts.filter(r => r.htmlMatchesIssuedPayload).length, readOnly: true }));
