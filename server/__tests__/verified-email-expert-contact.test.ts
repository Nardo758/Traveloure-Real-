/**
 * Pure contact decision for row 101. No database.
 *
 * Deny only when enforcement is on, the sender is not an earner, the recipient
 * is an earner, and the sender's email_verified is null. An earner sender is
 * allowed in every cell. Enforcement off is allow in every cell.
 *
 *   npx tsx --test --test-force-exit server/__tests__/verified-email-expert-contact.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EARNER_ROLES } from "../../shared/roles";
import { emailVerificationDeniedBody } from "../../shared/email-verification-gate";
import {
  decideTravelerMayContact,
  refuseUnverifiedTravelerContact,
  travelerContactSocketError,
  verifiedEmailActionsEnforced,
} from "../services/verified-email-action-gate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const EARNERS = [...EARNER_ROLES];
const NOT_EARNERS = ["user", "executive_assistant", "admin", "support", "moderator", "provider", null, undefined] as const;

function expectDecision(input: {
  enforced: boolean;
  senderRole: string | null | undefined;
  recipientRole: string | null | undefined;
  senderEmailVerified: Date | null | undefined;
}): "allow" | "deny" {
  const senderEarner = input.senderRole != null && (EARNERS as readonly string[]).includes(input.senderRole);
  const recipientEarner = input.recipientRole != null && (EARNERS as readonly string[]).includes(input.recipientRole);
  if (!input.enforced) return "allow";
  if (senderEarner) return "allow";
  if (!recipientEarner) return "allow";
  if (input.senderEmailVerified != null) return "allow";
  return "deny";
}

test("sender role x recipient role x verified x enforced", () => {
  const verifiedValues = [null, undefined, new Date("2026-10-24T00:00:00.000Z")] as const;
  let cells = 0;
  let denies = 0;
  for (const enforced of [false, true]) {
    for (const senderRole of [...EARNERS, ...NOT_EARNERS]) {
      for (const recipientRole of [...EARNERS, ...NOT_EARNERS]) {
        for (const senderEmailVerified of verifiedValues) {
          const input = { enforced, senderRole, recipientRole, senderEmailVerified };
          const decision = decideTravelerMayContact(input);
          const expected = expectDecision(input);
          assert.equal(
            decision,
            expected,
            `${enforced ? "on" : "off"} sender=${String(senderRole)} recipient=${String(recipientRole)} verified=${senderEmailVerified == null ? "null" : "set"}`,
          );
          cells += 1;
          if (decision === "deny") denies += 1;
        }
      }
    }
  }
  assert.ok(cells > 100);
  assert.ok(denies > 0);
  assert.equal(
    decideTravelerMayContact({
      enforced: true,
      senderRole: "user",
      recipientRole: "travel_expert",
      senderEmailVerified: null,
    }),
    "deny",
  );
  assert.equal(
    decideTravelerMayContact({
      enforced: true,
      senderRole: "user",
      recipientRole: "service_provider",
      senderEmailVerified: null,
    }),
    "deny",
  );
  assert.equal(
    decideTravelerMayContact({
      enforced: true,
      senderRole: "travel_expert",
      recipientRole: "user",
      senderEmailVerified: null,
    }),
    "allow",
  );
  assert.equal(
    decideTravelerMayContact({
      enforced: true,
      senderRole: "service_provider",
      recipientRole: "user",
      senderEmailVerified: null,
    }),
    "allow",
  );
});

test("an unenforced contact refusal writes no response", async () => {
  const prior = process.env.EMAIL_SENDS_ENABLED;
  delete process.env.EMAIL_SENDS_ENABLED;
  try {
    assert.equal(verifiedEmailActionsEnforced(), false);
    let status: number | undefined;
    const denied = await refuseUnverifiedTravelerContact(
      {
        status(code: number) {
          status = code;
          return this;
        },
        json() {
          throw new Error("unenforced contact gate must not write a body");
        },
      },
      "sender-not-in-db",
      "recipient-not-in-db",
    );
    assert.equal(denied, false);
    assert.equal(status, undefined);
  } finally {
    if (prior === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = prior;
  }
});

test("the socket refusal frame matches the shared 403 copy", () => {
  const body = emailVerificationDeniedBody();
  assert.deepEqual(travelerContactSocketError(), {
    type: "error",
    errorCode: body.code,
    error: body.message,
  });
  assert.equal(body.code, "email_verification_required");
  assert.equal(body.message, "Verify your email to continue.");
});

test("enforcement is read before the contact query", () => {
  const src = read("server", "services", "verified-email-action-gate.ts");
  const start = src.indexOf("export async function assertTravelerMayContact");
  const end = src.indexOf("export async function refuseUnverifiedTravelerContact");
  assert.ok(start >= 0 && end > start);
  const body = src.slice(start, end);
  const guard = body.indexOf('if (!verifiedEmailActionsEnforced()) return "allow"');
  const query = body.indexOf(".from(users)");
  assert.ok(guard >= 0 && query > guard);
});

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing end after ${startMarker}`);
  return src.slice(start, end);
}

test("message transports consult the gate before the rate-limit increment", () => {
  const messages = read("server", "routes", "messages.ts");
  const post = sliceBetween(messages, 'router.post("/", isAuthenticated', 'router.patch("/:messageId/read"');
  assert.ok(post.indexOf("refuseUnverifiedTravelerContact") < post.indexOf("checkMessageRateLimit"));
  assert.ok(post.indexOf("assertRecipientExists") < post.indexOf("refuseUnverifiedTravelerContact"));

  const start = sliceBetween(
    read("server", "routes", "conversations.routes.ts"),
    'router.post("/api/conversations/start"',
    'router.get("/api/admin/conversations"',
  );
  const gateAt = start.indexOf("refuseUnverifiedTravelerContact");
  assert.ok(gateAt > start.indexOf("resolveContactTarget"));
  assert.ok(gateAt < start.indexOf("checkMessageRateLimit"));
  assert.ok(gateAt < start.indexOf("recordConversationContext"));
  assert.ok(gateAt < start.indexOf("sendMessage"));

  const chats = sliceBetween(read("server", "routes.ts"), "app.post(api.chats.create.path", "app.get(api.helpGuideTrips.list.path");
  assert.equal(chats.split("refuseUnverifiedTravelerContact").length - 1, 2);
  assert.ok(chats.indexOf("refuseUnverifiedTravelerContact") < chats.indexOf("checkMessageRateLimit"));

  const shadowed = sliceBetween(
    read("server", "routes", "trips.routes.ts"),
    "router.post(api.chats.create.path",
    "router.get(api.helpGuideTrips.list.path",
  );
  assert.ok(shadowed.indexOf("refuseUnverifiedTravelerContact") < shadowed.indexOf("storage.createChat"));

  const socket = sliceBetween(read("server", "websocket.ts"), 'case "chat":', 'case "typing":');
  assert.ok(socket.indexOf("assertTravelerMayContact") < socket.indexOf("checkMessageRateLimit"));
  assert.ok(socket.indexOf("travelerContactSocketError") < socket.indexOf("checkMessageRateLimit"));
  assert.match(socket, /break;/);

  const legacy = sliceBetween(
    read("server", "routes", "content.routes.ts"),
    'router.post("/api/chat/start"',
    "// Instagram API routes",
  );
  assert.ok(legacy.indexOf("getUserById") < legacy.indexOf("refuseUnverifiedTravelerContact"));
  assert.ok(legacy.indexOf("refuseUnverifiedTravelerContact") < legacy.indexOf("checkMessageRateLimit"));
  assert.ok(legacy.indexOf("refuseUnverifiedTravelerContact") < legacy.indexOf("insertExpertChat"));
});

test("request rails to an expert mount requireVerifiedEmail(expert_contact) once", () => {
  const rails: Array<[string, string]> = [
    ["server/routes.ts", 'app.post("/api/expert-booking-requests", isAuthenticated, requireVerifiedEmail("expert_contact")'],
    ["server/routes/booking-actions.ts", "router.post('/expert-requests', isAuthenticated, requireVerifiedEmail(\"expert_contact\")"],
    ["server/routes/booking-actions.ts", "router.post('/trips/:id/expert-advisor', isAuthenticated, requireVerifiedEmail(\"expert_contact\")"],
    ["server/routes/booking-actions.ts", "router.post('/trips/:tripId/advisors', isAuthenticated, requireVerifiedEmail(\"expert_contact\")"],
    ["server/routes/handoff.routes.ts", 'router.post("/api/trips/:tripId/handoff/quote", isAuthenticated, requireVerifiedEmail("expert_contact")'],
    ["server/routes/handoff.routes.ts", 'router.post("/api/trips/:tripId/handoff", isAuthenticated, requireVerifiedEmail("expert_contact")'],
    ["server/routes/service-quotes.routes.ts", 'router.post("/api/services/:id/quote-requests", isAuthenticated, requireVerifiedEmail("expert_contact")'],
  ];
  for (const [file, line] of rails) {
    const src = read(...file.split("/"));
    assert.equal(src.split(line).length - 1, 1, `${file} missing ${line}`);
  }
});

test("contact, concierge, inbox answers, and message reads stay ungated", () => {
  const content = read("server", "routes", "content.routes.ts");
  const contact = sliceBetween(content, 'router.post("/api/contact"', 'router.post("/api/chat/start"');
  assert.ok(!contact.includes("requireVerifiedEmail"));
  assert.ok(!contact.includes("refuseUnverifiedTravelerContact"));

  const inbox = read("server", "routes", "expert-inbox-questions.routes.ts");
  assert.ok(!inbox.includes("requireVerifiedEmail"));
  assert.ok(!inbox.includes("assertTravelerMayContact"));

  const concierge = read("server", "routes", "concierge.routes.ts");
  assert.ok(!concierge.includes("requireVerifiedEmail(\"expert_contact\")"));
  assert.ok(!concierge.includes("refuseUnverifiedTravelerContact"));

  const messages = read("server", "routes", "messages.ts");
  const afterSend = messages.slice(messages.indexOf('router.patch("/:messageId/read"'));
  assert.ok(!afterSend.includes("refuseUnverifiedTravelerContact"));
});
