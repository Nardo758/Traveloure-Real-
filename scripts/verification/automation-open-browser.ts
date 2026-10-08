// Test-only wrapper around the native server routes and client. Not an app entrypoint.
import fs from "node:fs";
import express from "express";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { loadOwner, saveOwner } = await import(pathToFileURL(resolve("scripts/verification/automation-open-fixtures.mjs")).href);
const { redact } = await import(pathToFileURL(resolve("scripts/verification/automation-baseline-reporter.mjs")).href);

const owner = loadOwner();
if (process.env.NODE_ENV !== "test" || process.env.MESSAGING_VERIFICATION_SCHEMA !== owner.schema) {
  throw new Error("Approved isolated owner required");
}
for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[method].bind(console);
  console[method] = (...values: any[]) => original(...values.map(v =>
    redact(typeof v === "string" ? v : JSON.stringify(v))
      .replace(/(token=)[^&\s"'<>]+/gi, "$1[REDACTED]")
      .replace(/"(password|newPassword|token)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')));
}
const settingsPath = "/tmp/automation-part1-private-qa.json";
if ((fs.statSync(settingsPath).mode & 0o077) !== 0) throw new Error("Private QA settings required");
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const capturesPath = owner.mailPath;
const captures: any[] = fs.existsSync(capturesPath) ? JSON.parse(fs.readFileSync(capturesPath, "utf8")) : [];
const actualFetch = globalThis.fetch;
let mailQueue = Promise.resolve();
globalThis.fetch = async (input: any, init: any) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "api.resend.com") {
    if (init?.method?.toUpperCase() === "POST" && url.pathname === "/emails") {
      const payload = JSON.parse(String(init.body));
      const target = Array.isArray(payload.to) ? payload.to[0] : payload.to;
      const accounts = Object.values(owner.accounts).flatMap((group: any) => Object.values(group)) as any[];
      const account = accounts.find(a => a.email === target);
      if (!account || (Array.isArray(payload.to) && payload.to.length !== 1)) throw new Error("Non-QA recipient refused");
      payload.to = [/welcome/i.test(payload.subject) ? settings.SIGNUP_QA_TEST_INBOX : settings.ITINERARY_OUTCOME_TEST_EMAIL];
      const promise = mailQueue.then(async () => {
        await new Promise(r => setTimeout(r, 700));
        const response = await actualFetch(input, { ...init, body: JSON.stringify(payload) });
        const data = await response.clone().json();
        if (response.ok && data.id) {
          captures.push({ providerId: data.id, loop: account.loop, accountKind: account.kind,
            subject: payload.subject, html: payload.html, text: payload.text, acceptedAt: new Date().toISOString() });
          fs.writeFileSync(capturesPath, JSON.stringify(captures), { mode: 0o600 });
          fs.chmodSync(capturesPath, 0o600);
        }
        return response;
      });
      mailQueue = promise.then(() => undefined, () => undefined);
      return promise;
    }
    if ((init?.method ?? "GET").toUpperCase() === "GET") return actualFetch(input, init);
    throw new Error("Unapproved provider operation");
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("External API blocked in QA wrapper");
  return actualFetch(input, init);
};
// Fail closed on provider mutation even if a native path accidentally calls it.
const Stripe = (await import("stripe")).default;
const stripeProbe = new Stripe("sk_test_qa_network_forbidden");
for (const resource of ["paymentIntents", "refunds", "charges", "transfers", "payouts", "customers", "setupIntents"] as const) {
  const prototype = Object.getPrototypeOf(stripeProbe[resource]);
  for (const method of ["create", "capture", "cancel", "confirm", "update", "del"]) {
    if (typeof prototype[method] === "function") prototype[method] = async () => { throw new Error("Stripe mutation forbidden in Part 1 QA"); };
  }
}
const app = express(), server = createServer(app);
app.use(express.json());
app.get("/__qa/health", (_req, res) => res.json({ isolated: true, schema: owner.schema }));
app.use("/__qa", (req, res, next) => {
  if (req.get("x-qa-owner") !== owner.nonce) return res.status(403).json({ error: "QA owner required" });
  next();
});
let controlQueue = Promise.resolve();
app.use("/__qa", async (req, res, next) => {
  if (req.method === "GET") return next();
  const previous = controlQueue;
  let release!: () => void;
  controlQueue = new Promise<void>(r => { release = r; });
  await previous;
  res.once("finish", release); res.once("close", release);
  next();
});
app.post("/__qa/prepare", async (req, res) => {
  try {
    const { prepareLoop } = await import("./automation-open-scenarios");
    res.json(await prepareLoop(Number(req.body.loop), owner, saveOwner));
  } catch (error) { console.error(error); res.status(500).json({ error: "QA preparation failed; see redacted log" }); }
});
app.post("/__qa/start-clocks", async (_req, res) => {
  try {
    const { startRealClocks } = await import("./automation-open-scenarios");
    res.json(await startRealClocks(owner, saveOwner));
  } catch (error) { console.error(error); res.status(500).json({ error: "QA clock start failed; see redacted log" }); }
});
app.post("/__qa/start-followup-clock", async (_req, res) => {
  try {
    const { startFollowupClock } = await import("./automation-open-scenarios");
    res.json(await startFollowupClock(owner, saveOwner));
  } catch (error) { console.error(error); res.status(500).json({ error: "QA follow-up clock start failed" }); }
});
app.post("/__qa/check-writers", async (req, res) => {
  try {
    const { checkLegacyWriters } = await import("./automation-open-writer-checks");
    res.json(await checkLegacyWriters(Number(req.body.loop), owner));
  } catch (error) { console.error(error); res.status(500).json({ error: "Native writer scenario failed; see redacted log" }); }
});
app.get("/__qa/render/:id", (req, res) => {
  const mail = captures.find(c => c.providerId === req.params.id);
  if (!mail) return res.sendStatus(404);
  res.type("html").send(mail.html);
});
// Browser rendering is exposed without the owner header, but only generated
// QA content; no manifest, address, credential or token JSON is exposed.
app.get("/qa-mail-render/:id", (req, res) => {
  const mail = captures.find(c => c.providerId === req.params.id);
  if (!mail) return res.sendStatus(404);
  res.type("html").send(mail.html);
});
await (await import("../../server/routes")).registerRoutes(server, app);
// Native route registration starts this unrelated timer. Stop the existing
// instance in the QA wrapper: clock checks are manual, not a second scheduler.
await (await import("../../server/services/travelpulse-scheduler.service")).travelPulseScheduler.stop();
await (await import("../../server/vite")).setupVite(server, app);
server.listen(owner.port, "0.0.0.0", () => console.log(`QA_BROWSER_READY_PORT=${owner.port}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
