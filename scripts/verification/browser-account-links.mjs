#!/usr/bin/env node
/**
 * QA-only account/email journey helper.
 *
 * Credentials are read from the private owner JSON and message links are read
 * from its private mail capture. This script never prints credentials, email
 * addresses, tokens, or full link URLs. It is intentionally opt-in because
 * browser_signup aliases are single-use and must be freshly prepared first.
 *
 * Run with:
 *   RUN_QA_SIGNUP=1 node scripts/verification/browser-account-links.mjs
 * Optional:
 *   AUTOMATION_OWNER_FILE=/tmp/automation-part1-open-owner.json
 *   QA_BASE_URL=http://127.0.0.1:5001
 */
import fs from "node:fs/promises";
import { chromium } from "playwright";

const ownerFile =
  process.env.AUTOMATION_OWNER_FILE || "/tmp/automation-part1-open-owner.json";
const owner = JSON.parse(await fs.readFile(ownerFile, "utf8"));
const baseURL =
  process.env.QA_BASE_URL || `http://127.0.0.1:${owner.port || 5001}`;
const evidencePath =
  "reports/automation-part1-evidence/browser-account-links.json";

function redactText(text = "") {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked email]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[masked id]")
    .replace(/https?:\/\/[^\s]*token=[^\s]+/gi, "[signed URL redacted]");
}

async function readMessages() {
  return JSON.parse(await fs.readFile(owner.mailPath, "utf8"));
}

async function actualAnchors(page, html) {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "text/html");
    return [...doc.querySelectorAll("a[href]")].map((a) => ({
      label: (a.innerText || a.textContent || "").trim(),
      href: a.href,
    }));
  }, html);
}

async function maskRenderedPage(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue.replace(
        /https?:\/\/[^\s]*token=[^\s]+/gi,
        "[signed URL redacted]",
      );
      node.nodeValue = node.nodeValue.replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        "[masked email]",
      );
    }
    for (const anchor of document.querySelectorAll("a[href]")) {
      const url = new URL(anchor.href, location.origin);
      if (url.searchParams.has("token")) anchor.href = "/redacted-link";
    }
    for (const input of document.querySelectorAll("input")) {
      if (input.type === "email" || input.type === "password") {
        input.value = "[masked]";
      }
    }
  });
}

async function waitUntilPrepared(loop) {
  const deadline = Date.now() + 120_000;
  while (!owner.preparedLoops?.includes(loop) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    Object.assign(
      owner,
      JSON.parse(await fs.readFile(ownerFile, "utf8")),
    );
  }
  if (!owner.preparedLoops?.includes(loop)) {
    throw new Error(`QA loop ${loop} was not prepared before timeout`);
  }
}

if (process.env.RUN_QA_SIGNUP !== "1") {
  const messages = await readMessages();
  const safeSummary = [1, 2].map((loop) => {
    const welcome = messages.find(
      (message) =>
        message.loop === loop &&
        message.accountKind === "browser_signup" &&
        /Start Planning/i.test(message.html),
    );
    return {
      loop,
      prepared: Boolean(owner.preparedLoops?.includes(loop)),
      welcomeProviderId: welcome?.providerId || null,
    };
  });
  console.log(JSON.stringify({ baseURL, loops: safeSummary }));
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const results = {};
try {
  for (const loop of [1, 2]) {
    await waitUntilPrepared(loop);
    const credentials = owner.accounts[String(loop)].browser_signup;
    const context = await browser.newContext({ timezoneId: "UTC" });
    const page = await context.newPage();
    await page.goto(new URL("/signup", baseURL).href);
    await page.addStyleTag({
      content:
        "input { color: transparent !important; text-shadow: 0 0 8px #000 !important; caret-color: transparent !important; }",
    });
    await page.getByTestId("input-name").fill(
      `${credentials.firstName} ${credentials.lastName}`,
    );
    await page.getByTestId("input-email").fill(credentials.email);
    await page.getByTestId("input-password").fill(credentials.password);
    await page.getByTestId("button-create-account").click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await maskRenderedPage(page);

    const messages = await readMessages();
    const welcome = messages.find(
      (message) =>
        message.loop === loop &&
        message.accountKind === "browser_signup" &&
        /Start Planning/i.test(message.html),
    );
    if (!welcome) {
      throw new Error(`No captured welcome email found for loop ${loop}`);
    }
    const anchors = await actualAnchors(page, welcome.html);
    const meaningful = anchors.filter((anchor) =>
      ["Start Planning", "Explore destinations", "Browse experts"].includes(
        anchor.label,
      ),
    );
    const opened = [];
    for (const anchor of meaningful) {
      const target = new URL(anchor.href, baseURL);
      if (target.origin !== new URL(baseURL).origin) {
        throw new Error("Captured welcome link was not same-origin");
      }
      await page.goto(target.href, { waitUntil: "domcontentloaded" });
      opened.push({
        label: anchor.label,
        route: new URL(page.url()).pathname,
      });
    }
    results[String(loop)] = {
      signup: "submitted through native /signup UI",
      postSubmitPath: "/dashboard",
      welcomeProviderId: welcome.providerId,
      openedCapturedLinks: opened,
    };
    await context.close();
  }

  await fs.mkdir("reports/automation-part1-evidence", { recursive: true });
  let priorEvidence = {};
  try {
    priorEvidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  } catch {
    priorEvidence = {};
  }
  priorEvidence.scriptRuns = [
    ...(priorEvidence.scriptRuns || []),
    {
      sanitized: true,
      privateValuesIncluded: false,
      loops: results,
    },
  ];
  await fs.writeFile(evidencePath, `${JSON.stringify(priorEvidence, null, 2)}\n`);
  console.log(JSON.stringify({ report: evidencePath, loops: results }));
} finally {
  await browser.close();
}
