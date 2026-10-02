import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { coreMessages, coreByKind } from "../_core-index";
import { renderCoreEmail } from "../_core-renderer";
import { isDaytime, marketingPreferences, SIGNUP_RESPONSE } from "../_core-policy";
import { dispatchDefinition } from "../../event-dispatcher";

// Unit tests only: no network, real mailbox, database connection or real secret.
const fixture = vi.hoisted(() => ({
  user: {} as any, state: {} as any, jobs: [] as any[], queries: [] as any[],
  claimable: true, trips: false, tokenCount: 0, execute: vi.fn(),
}));
vi.mock("../../../db", () => ({
  db: { execute: fixture.execute, transaction: async (action: any) => action({ execute: fixture.execute }) },
}));
import { recordPasswordAttempt, requestAccountDeletion, recordSuccessfulLogin, verifyJourneyToken,
  acceptSocialEmailAssertion } from "../_core-auth";
import { queueWelcome, scheduleSignup, requestVerification, duplicateSignup } from "../_core-store";
import { journeyDeliveryGate } from "../_core-delivery";

beforeEach(() => {
  vi.useRealTimers();
  fixture.user = { id: "unit-user", email: "unit@example.invalid", first_name: "Unit",
    email_verified: null, is_deleted: false, is_suspended: false, preferences: {} };
  fixture.state = { user_id: "unit-user", account_state: "active", failed_attempts: 0,
    locked_until: null, welcome_at: null, deletion_requested_at: null, deletion_due_at: null };
  fixture.jobs = []; fixture.queries = []; fixture.claimable = true; fixture.trips = false; fixture.tokenCount = 0;
  fixture.execute.mockImplementation(async (query: any) => {
    const parsed = new PgDialect().sqlToQuery(query);
    const text = parsed.sql.replace(/\s+/g, " ");
    fixture.queries.push({ text, params: parsed.params });
    const p = parsed.params;
    if (text.startsWith("SELECT * FROM users")) return { rows: [fixture.user] };
    if (text.includes("SELECT u.*,s.account_state")) return { rows: [{ ...fixture.user, ...fixture.state }] };
    if (text.startsWith("SELECT * FROM signup_journey_state")) return { rows: [fixture.state] };
    if (text.includes("SELECT 1 FROM trips")) return { rows: fixture.trips ? [{}] : [] };
    if (text.includes(" AS count")) return { rows: [{ count: fixture.tokenCount }] };
    if (text.startsWith("SELECT user_id FROM email_verification_tokens")) return { rows: [{ user_id: "unit-user" }] };
    if (text.startsWith("UPDATE email_verification_tokens SET used_at=NOW()") && text.includes("token_hash=")) {
      if (!fixture.claimable) return { rows: [] };
      fixture.claimable = false;
      return { rows: [{ user_id: "unit-user" }] };
    }
    if (text.startsWith("UPDATE users SET email_verified=")) fixture.user.email_verified = new Date();
    if (text.startsWith("UPDATE signup_journey_state SET failed_attempts=")) {
      fixture.state.failed_attempts = p[0]; fixture.state.locked_until = p[1];
    }
    if (text.startsWith("UPDATE signup_journey_state SET account_state='pending_deletion'")) {
      fixture.state.account_state = "pending_deletion";
      fixture.state.deletion_requested_at = p[0]; fixture.state.deletion_due_at = p[1];
    }
    if (text.startsWith("UPDATE signup_journey_state SET account_state='active'")) fixture.state.account_state = "active";
    if (text.startsWith("INSERT INTO signup_journey_jobs")) {
      if (fixture.jobs.some((j) => j.key === p[4])) return { rows: [] };
      fixture.jobs.push({ id: p[0], userId: p[1], kind: p[2], relatedId: p[3], key: p[4], due: p[5] });
      return { rows: [{ id: p[0] }] };
    }
    return { rows: [] };
  });
});

describe("Core registry and exact starting copy", () => {
  it("owns fifteen distinct nodes, preserving the three existing IDs", () => {
    expect(coreMessages).toHaveLength(15);
    expect(new Set(coreMessages.map((m) => m.node.id)).size).toBe(15);
    expect(coreByKind.get("welcome")!.node.id).toBe("messaging.auth-welcome-email");
    expect(coreByKind.get("verify_email")!.node.id).toBe("messaging.auth-verification-email");
    expect(coreByKind.get("reset_request")!.node.id).toBe("messaging.auth-password-reset-email");
  });
  it("Google is disabled and cannot execute", async () => {
    const action = vi.fn();
    expect(await dispatchDefinition(coreByKind.get("google_login_added")!.node, { coreEligible: true }, action))
      .toEqual({ executed: false, reason: "disabled" });
    expect(action).not.toHaveBeenCalled();
  });
  it("successful welcome cancels every reminder; a skipped action cancels nothing", async () => {
    const cancel = vi.fn();
    const node = coreByKind.get("welcome")!.node;
    await dispatchDefinition(node, { coreEligible: true }, () => ({ queued: false }), { cancellation: { cancel } });
    expect(cancel).not.toHaveBeenCalled();
    await dispatchDefinition(node, { coreEligible: true }, () => ({ queued: true }), { cancellation: { cancel } });
    expect(cancel.mock.calls.map((c) => c[1])).toEqual([
      "messaging.verify_reminder_1h", "messaging.verify_reminder_1d", "messaging.verify_reminder_3d",
    ]);
  });
  it.each(coreMessages.map((m) => [m.kind, m] as const))("%s has the shared purple, inline, image-free HTML and plain text", (_kind, message) => {
    const rendered = renderCoreEmail(message, { name: "" }, "https://example.invalid/action", "https://example.invalid/unsubscribe");
    expect(rendered.html).toContain("#5b2a6e");
    expect(rendered.html).toContain('role="presentation"');
    expect(rendered.html).not.toMatch(/<img\b|<script\b/);
    expect(rendered.text.length).toBeGreaterThan(30);
    expect(rendered.text).not.toContain("{name}");
    expect(rendered.headers != null).toBe(message.node.type === "marketing");
  });
  it("preserves the original reminder escalation and compliant deletion copy", () => {
    expect(coreByKind.get("verify_reminder_1h")!.copy({ name: "Unit" }).subject).toBe("Still want to plan your next trip?");
    expect(coreByKind.get("verify_reminder_1d")!.copy({ name: "Unit" }).subject).toBe("Don't lose your spot, Unit");
    expect(coreByKind.get("verify_reminder_3d")!.copy({ name: "Unit" }).subject).toBe("Last reminder: activate your account");
    expect(coreByKind.get("deletion_complete")!.copy({ name: "Unit" }).body).toBe(
      "Your account and personal data have been removed, as requested. Some records are retained only where required for legal or accounting purposes.");
  });
  it("escapes untrusted HTML and strips subject newlines", () => {
    const result = renderCoreEmail(coreByKind.get("welcome")!, { name: '<script>\r\nUnit</script>' }, "https://example.invalid");
    expect(result.html).not.toContain("<script>");
    expect(result.subject).not.toMatch(/[\r\n]/);
  });
});

describe("Consent, time zone, localization and send-time guards", () => {
  it("defaults marketing off, honoring an explicit unsubscribe", () => {
    expect(marketingPreferences({}).consent).toBe(false);
    expect(marketingPreferences({ settings: { notifications: { marketing: true } } }).consent).toBe(true);
    expect(marketingPreferences({ settings: { notifications: { marketing: true } }, journeyMarketingOptOut: true }).consent).toBe(false);
  });
  it("9:00 inclusive / 20:00 exclusive in saved time zones; invalid zones use UTC", () => {
    expect(isDaytime(new Date("2026-10-02T03:30:00Z"), "Asia/Kolkata")).toBe(true);
    expect(isDaytime(new Date("2026-10-02T14:30:00Z"), "Asia/Kolkata")).toBe(false);
    expect(isDaytime(new Date("2026-10-02T08:59:00Z"), "invalid")).toBe(false);
    expect(isDaytime(new Date("2026-10-02T09:00:00Z"), "invalid")).toBe(true);
  });
  it.each(["es", "fr", "hi"])("translates marketing for %s", (language) => {
    const result = renderCoreEmail(coreByKind.get("profile_nudge")!, { name: "Unit", language }, "https://example.invalid", "https://example.invalid/unsubscribe");
    expect(result.html).toContain(`lang="${language}"`);
    expect(result.subject).not.toBe("Finish setting up your profile");
  });
  it("unknown languages genuinely fall back to English and name to there", () => {
    const result = renderCoreEmail(coreByKind.get("welcome")!, { name: "", language: "unknown" });
    expect(result.subject).toBe("Welcome to Traveloure, there");
    expect(result.html).toContain('lang="en"');
  });
  it.each([
    ["en", "Plan my 1st Experience"],
    ["es", "Planificar mi primera experiencia"],
    ["fr", "Planifier ma première expérience"],
    ["hi", "मेरे पहले अनुभव की योजना बनाएं"],
  ])("uses the approved experience CTA in %s HTML and plain text", (language, button) => {
    const result = renderCoreEmail(coreByKind.get("welcome")!, { name: "Unit", language },
      "https://example.invalid/dashboard");
    expect(result.html).toContain(button);
    expect(result.text).toContain(button);
    expect(result.html).not.toContain("Plan my first trip");
    expect(coreByKind.get("welcome")!.copy({ name: "Unit" }).path).toBe("/dashboard");
  });
  it("marketing requires unsubscribe headers and link, security does not", () => {
    expect(() => renderCoreEmail(coreByKind.get("profile_nudge")!, { name: "Unit" })).toThrow("Marketing requires");
    expect(renderCoreEmail(coreByKind.get("new_device_login")!, { name: "Unit" }).headers).toBeUndefined();
  });
  it("must-have/security bypass consent and quiet hours", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T02:00:00Z"));
    expect((await journeyDeliveryGate("unit-user", "account_locked")).action).toBe("send");
    expect((await journeyDeliveryGate("unit-user", "new_device_login")).action).toBe("send");
    expect((await journeyDeliveryGate("unit-user", "profile_nudge")).action).toBe("skip");
  });
  it("retry rechecks profile completion and existing itinerary", async () => {
    fixture.user.email_verified = new Date();
    fixture.user.preferences = { settings: { notifications: { marketing: true } } };
    Object.assign(fixture.user, { last_name: "Tester", bio: "Traveler", profile_image_url: "/photo" });
    expect(await journeyDeliveryGate("unit-user", "profile_nudge")).toMatchObject({ action: "skip", reason: "profile_complete" });
    fixture.trips = true;
    expect(await journeyDeliveryGate("unit-user", "planner_nudge")).toMatchObject({ action: "skip", reason: "itinerary_exists" });
  });
  it("a queued verification is skipped after verification; deletion completion remains deliverable after anonymization", async () => {
    fixture.user.email_verified = new Date();
    expect((await journeyDeliveryGate("unit-user", "verify_reminder_3d")).action).toBe("skip");
    fixture.user.is_deleted = true;
    expect((await journeyDeliveryGate("unit-user", "deletion_complete")).action).toBe("send");
    expect((await journeyDeliveryGate("unit-user", "welcome")).action).toBe("skip");
  });
});

describe("Durable auth sequencing and safeguards (mocked database)", () => {
  it("welcome cannot queue before verification", async () => {
    await queueWelcome({ execute: fixture.execute } as any, "unit-user");
    expect(fixture.jobs).toHaveLength(0);
  });
  it("signup schedules exactly one verification and the 1h/1d/3d reminders", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    await scheduleSignup("unit-user"); await scheduleSignup("unit-user");
    expect(fixture.jobs.map((j) => j.kind)).toEqual(["verify_email", "verify_reminder_1h", "verify_reminder_1d", "verify_reminder_3d"]);
    expect(fixture.jobs.slice(1).map((j) => (j.due.getTime() - Date.now()) / 3600000)).toEqual([1, 24, 72]);
    expect(fixture.queries.some((q) => q.text.includes("ON CONFLICT(idempotency_key) DO NOTHING"))).toBe(true);
  });
  it("verification is a conditional single-use claim, then welcome, then cancellation", async () => {
    expect(await verifyJourneyToken("unit-token-hash")).toBe("unit-user");
    expect(await verifyJourneyToken("unit-token-hash")).toBe(false);
    expect(fixture.jobs.map((j) => j.kind)).toEqual(["welcome"]);
    expect(fixture.queries.find((q) => q.text.includes("UPDATE email_verification_tokens")).text).toContain("used_at IS NULL AND expires_at>NOW()");
    expect(fixture.queries.some((q) => q.text.includes("skip_reason='email_verified'"))).toBe(true);
  });
  it("social email presence does not imply verified; a signed true assertion permits welcome", async () => {
    await acceptSocialEmailAssertion("unit-user", undefined);
    expect(fixture.jobs.some((j) => j.kind === "welcome")).toBe(false);
    await acceptSocialEmailAssertion("unit-user", true);
    expect(fixture.jobs.some((j) => j.kind === "welcome")).toBe(true);
    expect(fixture.jobs.some((j) => j.kind === "google_login_added")).toBe(false);
  });
  it("verification rate admission is counted in SQL and includes pending reservations", async () => {
    fixture.tokenCount = 3;
    expect(await requestVerification("unit-user", "request")).toBe("limited");
    expect(fixture.jobs).toHaveLength(0);
    expect(fixture.queries.find((q) => q.text.includes(" AS count")).text).toContain("created_at>NOW()-INTERVAL '1 hour'");
  });
  it("duplicate signup notification is once per account/hour without an identifying response", async () => {
    await duplicateSignup("unit-user"); await duplicateSignup("unit-user");
    expect(fixture.jobs.map((j) => j.kind)).toEqual(["already_have_account"]);
    expect(Object.keys(SIGNUP_RESPONSE)).toEqual(["message"]);
    expect(SIGNUP_RESPONSE.message).not.toContain("Account created");
  });
  it("locks on failure five, holds thirty minutes, emits only one lock email", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    for (let i = 0; i < 4; i++) expect(await recordPasswordAttempt("unit-user", false)).toEqual({ allowed: false, locked: false });
    expect(await recordPasswordAttempt("unit-user", false)).toEqual({ allowed: false, locked: true });
    expect(new Date(fixture.state.locked_until).getTime() - Date.now()).toBe(30 * 60000);
    expect(await recordPasswordAttempt("unit-user", true)).toEqual({ allowed: false, locked: true });
    expect(fixture.jobs.map((j) => j.kind)).toEqual(["account_locked"]);
  });
  it("successful password check resets consecutive failures; expiry starts a new streak", async () => {
    await recordPasswordAttempt("unit-user", false);
    expect(await recordPasswordAttempt("unit-user", true)).toEqual({ allowed: true, locked: false });
    expect(fixture.state.failed_attempts).toBe(0);
    fixture.state.locked_until = new Date(Date.now() - 1); fixture.state.failed_attempts = 5;
    await recordPasswordAttempt("unit-user", false);
    expect(fixture.state.failed_attempts).toBe(1);
  });
  it("deletion request is idempotent and does not anonymize before seven days", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    await requestAccountDeletion("unit-user"); await requestAccountDeletion("unit-user");
    expect(fixture.state.account_state).toBe("pending_deletion");
    expect(fixture.jobs.map((j) => j.kind)).toEqual(["deletion_confirm", "deletion_complete"]);
    expect(fixture.jobs[1].due.getTime() - Date.now()).toBe(7 * 86400000);
    expect(fixture.queries.some((q) => q.text.includes("SET is_deleted=true"))).toBe(false);
  });
  it("successful login cancels deletion and repeated device fingerprints use a unique claim", async () => {
    // Fake secret is local to this isolated unit process, never a workspace value.
    vi.stubEnv("SESSION_SECRET", "unit-fixture-only");
    try {
      fixture.state.account_state = "pending_deletion";
      await recordSuccessfulLogin("unit-user", { ip: "192.0.2.1", headers: { "user-agent": "Unit Browser" } });
      expect(fixture.state.account_state).toBe("active");
      expect(fixture.queries.some((q) => q.text.includes("deletion_cancelled_by_login"))).toBe(true);
      expect(fixture.queries.some((q) => q.text.includes("signup_journey_devices") && q.text.includes("ON CONFLICT DO NOTHING"))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
  it("SQL migration provides durable uniqueness without backfilling accounts or changing financial tables", () => {
    const migration = fs.readFileSync("server/migrations/338_signup_journey.sql", "utf8");
    expect(migration).toContain("signup_journey_jobs_idempotency_idx");
    expect(migration).toContain("journey_email_idempotency_idx");
    expect(migration).not.toMatch(/UPDATE users|ALTER TABLE (bookings|payments|service_bookings)/);
  });
  it("worker uses SKIP LOCKED, leased recovery, transactional outbox and 1/5/30 retries", () => {
    const worker = fs.readFileSync("server/automations/messaging/_core-worker.ts", "utf8");
    expect(worker).toContain("FOR UPDATE SKIP LOCKED");
    expect(worker).toContain("lease_until<NOW()");
    expect(worker).toContain("INSERT INTO email_outbox");
    expect(worker).toContain("[1, 5, 30]");
    const outbox = fs.readFileSync("server/services/email-outbox.service.ts", "utf8");
    expect(outbox).toContain("params.journeyDelivery");
    expect(outbox).toContain("_nextRetryAfter(attemptCount)");
  });
});