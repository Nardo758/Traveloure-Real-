import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import { signupAutomations } from "../signup-index";
import { createAutomationRegistry } from "../../registry";
import { REMINDER_DELAYS, signupEmail, signupLanguage } from "../../../services/signup-email-payloads";

test("Part 1 has exactly six active journey files; all cancellation references resolve", () => {
  assert.equal(readdirSync("server/automations/messaging/signup").filter((f) => f.endsWith(".ts")).length, 6);
  const registry = createAutomationRegistry(signupAutomations);
  assert.equal(registry.byId.size, 6);
  assert.equal(signupAutomations.every((n) => n.enabled), true);
  const welcome = registry.byId.get("messaging.auth-welcome-email")!;
  assert.deepEqual(welcome.cancels, [
    "messaging.verify-reminder-1h", "messaging.verify-reminder-1d", "messaging.verify-reminder-3d",
  ]);
  assert.equal(welcome.condition.evaluate({ active: true, verified: false }), false);
  assert.equal(welcome.condition.evaluate({ active: true, verified: true }), true);
  for (const node of signupAutomations.filter((n) => n.name.startsWith("verify_reminder"))) {
    assert.equal(node.condition.evaluate({ active: true, verified: true, due: true }), false);
    assert.equal(node.condition.evaluate({ active: true, verified: false, due: false }), false);
    assert.equal(node.condition.evaluate({ active: true, verified: false, due: true }), true);
  }
});

test("reminder deadlines are 1h/1d/3d, not an in-process delay", () => {
  assert.deepEqual(REMINDER_DELAYS, [3600000, 86400000, 259200000]);
  assert.equal(signupAutomations.every((n) => n.delay === null), true);
});

test("name/no-name and language/unset produce safe bodies; reminders never reuse an expired token", () => {
  for (const language of ["en", "es"] as const) for (const firstName of [null, "  ", '<img src=x onerror="evil()">']) {
    for (const node of signupAutomations) {
      const mail = signupEmail(node.name, "fixture@example.invalid", firstName, language,
        "https://example.invalid/verify-email?token=fixture");
      assert.ok(mail.subject);
      assert.ok(mail.text);
      assert.ok(!mail.html.includes('<img src=x'));
      if (node.name.startsWith("verify_reminder")) assert.ok(!mail.text!.includes("?token="));
    }
  }
  assert.equal(signupLanguage(undefined), "en");
  assert.equal(signupLanguage({ settings: { language: "es-MX" } }), "es");
  assert.equal(signupLanguage({ language: "unsupported" }), "en");
});