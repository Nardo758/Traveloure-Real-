import { describe, expect, it, vi } from "vitest";
import { ProposalFixture } from "./fixtures/vendor-bulk-proposal-model";

// Fail closed at module boundaries: no DB connection or real transport can exist.
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../infrastructure", () => ({
  createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  databaseQueryDuration: { labels: () => ({ observe: vi.fn() }) },
}));
import { sendEmail } from "../email.service";
import { VendorManagementService } from "../vendor-management.service";
import { dispatchMessagingEvent } from "../../automations/messaging/runtime";

function currentFixture() {
  const service = new VendorManagementService();
  vi.spyOn(service, "getContract").mockImplementation(async id => ({
    id, tripId: "trip", vendorName: "Synthetic Vendor", vendorEmail: `${id}@traveloure-qa.test`,
  } as any));
  const history = vi.spyOn(service, "logCommunication").mockResolvedValue({} as any);
  const send = vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true, id: "mock-id" });
  return { service, history, send };
}

describe("actual sender audit — known defects, not fixed by this proposal", () => {
  it("test transport resolves to a physical stub and network fallback is blocked", () => {
    expect(vi.isMockFunction(sendEmail)).toBe(true);
    expect(() => fetch("https://example.invalid")).toThrow("prohibit network access");
  });
  it("partial failure then whole-batch retry contacts the successful recipient twice", async () => {
    const { service, send } = currentFixture();
    send.mockResolvedValueOnce({ ok: true, id: "a" }).mockResolvedValueOnce({ ok: false, error: "rejected" });
    expect(await service.sendBulkVendorEmail("trip", ["a", "b"], "subject", "<body>"))
      .toEqual({ sent: 1, failed: 1, failureReasons: ["Contract b: rejected"] });
    await service.sendBulkVendorEmail("trip", ["a", "b"], "subject", "<body>");
    expect(send.mock.calls.map(([p]) => p.to)).toEqual([
      "a@traveloure-qa.test", "b@traveloure-qa.test", "a@traveloure-qa.test", "b@traveloure-qa.test",
    ]);
    expect(send.mock.calls[0][0].html).toContain("&lt;body&gt;");
  });
  it("provider acceptance followed by history failure is reported failed and resent", async () => {
    const { service, send, history } = currentFixture();
    history.mockRejectedValueOnce(new Error("history unavailable"));
    expect((await service.sendBulkVendorEmail("trip", ["a"], "subject", "body")).failed).toBe(1);
    await service.sendBulkVendorEmail("trip", ["a"], "subject", "body");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every(([p]) => !p.idempotencyKey)).toBe(true);
  });
  it("two concurrent current batches can both submit the same recipient", async () => {
    const { service, send } = currentFixture();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const bothEntered = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    send.mockImplementation(async () => {
      if (++calls === 2) entered();
      await gate;
      return { ok: true, id: "accepted" };
    });
    const first = service.sendBulkVendorEmail("trip", ["a"], "subject", "body");
    const second = service.sendBulkVendorEmail("trip", ["a"], "subject", "body");
    await bothEntered;
    release();
    expect((await Promise.all([first, second])).map(r => r.sent)).toEqual([1, 1]);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("duplicate contract IDs send twice; missing addresses fail without stopping later entries", async () => {
    const { service, send } = currentFixture();
    vi.mocked(service.getContract).mockImplementation(async id => ({
      id, tripId: "trip", vendorEmail: id === "missing" ? null : `${id}@traveloure-qa.test`,
    } as any));
    const result = await service.sendBulkVendorEmail("trip", ["a", "missing", "a"], "subject", "body");
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("main registry wrappers execute actions repeatedly; they are not durable dedupe", async () => {
    const action = vi.fn(async () => "receipt");
    for (let i = 0; i < 2; i++) await dispatchMessagingEvent(
      "messaging.email-outbox-enqueue", "email.enqueue",
      { emailType: "vendor_bulk" }, {}, action,
    );
    expect(action).toHaveBeenCalledTimes(2);
  });
});

describe("proposed protocol — isolated executable ordering specification", () => {
  it("atomic commit failure sends nothing; replay commits one obligation per contract", () => {
    const f = new ProposalFixture();
    expect(() => f.commit("batch", "frozen payload", ["a", "b"], true)).toThrow();
    expect(f.rows.size).toBe(0);
    expect(f.provider.calls).toEqual([]);
    f.commit("batch", "frozen payload", ["a", "a", "b"]);
    f.commit("batch", "frozen payload", ["b", "a"]);
    expect(f.rows.size).toBe(2);
    expect(() => f.commit("batch", "changed payload", ["a", "b"])).toThrow("409");
    expect(() => f.commit("batch", "frozen payload", ["a"])).toThrow("409");
  });
  it("partial failure retries only the unsent recipient", () => {
    const f = new ProposalFixture();
    f.commit("batch", "body", ["a", "b"]);
    for (const [key, outcome] of [["batch/a", "accept"], ["batch/b", "reject"]] as const) {
      f.claim(key, 1);
      f.handoff(key, 1, outcome);
    }
    f.commit("batch", "body", ["a", "b"]);
    expect(f.claim("batch/a", 2)).toBe(false);
    expect(f.claim("batch/b", 2)).toBe(true);
    f.handoff("batch/b", 2, "accept");
    expect(f.provider.calls).toEqual(["batch/a", "batch/b", "batch/b"]);
    expect(f.provider.accepted.size).toBe(2);
  });
  it.each(["accept-timeout", "lost-stamp"] as const)("%s reuses immutable bytes and provider identity", mode => {
    const f = new ProposalFixture();
    f.commit("batch", "frozen ICS UID + DTSTAMP + base64 bytes", ["a"]);
    f.claim("batch/a", 1);
    f.handoff("batch/a", 1, mode === "accept-timeout" ? mode : "accept", mode === "lost-stamp");
    f.expire("batch/a");
    f.claim("batch/a", 2);
    f.handoff("batch/a", 2, "accept");
    expect(f.provider.calls).toEqual(["batch/a", "batch/a"]);
    expect(f.provider.accepted.size).toBe(1);
    expect(f.rows.get("batch/a")?.state).toBe("sent");
  });
  it("expired provider retry window holds, including manual retry, rather than sending again", () => {
    const f = new ProposalFixture();
    f.commit("batch", "body", ["a"]);
    f.claim("batch/a", 1);
    f.handoff("batch/a", 1, "accept-timeout");
    f.now = f.safeRetryWindow;
    f.claim("batch/a", 2);
    expect(f.handoff("batch/a", 2, "accept")).toBe(false);
    expect(f.claim("batch/a", 3)).toBe(false);
    expect(f.provider.calls).toHaveLength(1);
    expect(f.rows.get("batch/a")?.state).toBe("held");
  });
  it("history repair failure never makes an accepted obligation eligible to send", () => {
    const f = new ProposalFixture();
    f.commit("batch", "body", ["a"]);
    f.claim("batch/a", 1);
    f.handoff("batch/a", 1, "accept");
    f.repairHistory("batch/a", true);
    expect(f.claim("batch/a", 2)).toBe(false);
    f.repairHistory("batch/a");
    f.repairHistory("batch/a");
    expect(f.logs.size).toBe(1);
    expect(f.provider.calls).toHaveLength(1);
  });
  it("stale owner cannot hand off or overwrite a reclaimed row", () => {
    const f = new ProposalFixture();
    f.commit("batch", "body", ["a"]);
    f.claim("batch/a", 1);
    f.expire("batch/a");
    f.claim("batch/a", 2);
    expect(f.handoff("batch/a", 1, "accept")).toBe(false);
    expect(f.finish("batch/a", 1, true)).toBe(false);
    f.handoff("batch/a", 2, "accept");
    expect(f.finish("batch/a", 1, false)).toBe(false);
    expect(f.rows.get("batch/a")?.state).toBe("sent");
    expect(f.provider.accepted.size).toBe(1);
  });
  it.each(["old-first", "new-first"] as const)("acceptance before lease loss: %s completions are fenced", order => {
    const f = new ProposalFixture();
    f.commit("batch", "body", ["a"]);
    f.claim("batch/a", 1);
    f.handoff("batch/a", 1, "accept", true);
    f.expire("batch/a");
    f.claim("batch/a", 2);
    if (order === "old-first") expect(f.finish("batch/a", 1, true)).toBe(false);
    f.handoff("batch/a", 2, "accept");
    if (order === "new-first") expect(f.finish("batch/a", 1, true)).toBe(false);
    expect(f.provider.calls).toHaveLength(2);
    expect(f.provider.accepted.size).toBe(1);
    expect(f.rows.get("batch/a")?.state).toBe("sent");
  });
  // Enumerate every interleaving preserving each batch's commit→claim→handoff order.
  function interleave(a: string[], b: string[]): string[][] {
    if (!a.length) return [b];
    if (!b.length) return [a];
    return [
      ...interleave(a.slice(1), b).map(tail => [a[0], ...tail]),
      ...interleave(a, b.slice(1)).map(tail => [b[0], ...tail]),
    ];
  }
  it("all 20 concurrent same-batch orderings accept exactly once", () => {
    const orderings = interleave(["Acommit", "Aclaim", "Asend"], ["Bcommit", "Bclaim", "Bsend"]);
    expect(orderings).toHaveLength(20);
    for (const ordering of orderings) {
      const f = new ProposalFixture();
      const owners = new Set<number>();
      for (const op of ordering) {
        const owner = op[0] === "A" ? 1 : 2;
        if (op.endsWith("commit")) f.commit("batch", "body", ["a"]);
        if (op.endsWith("claim") && f.claim("batch/a", owner)) owners.add(owner);
        if (op.endsWith("send") && owners.has(owner)) f.handoff("batch/a", owner, "accept");
      }
      expect(f.rows.size, ordering.join(",")).toBe(1);
      expect(f.provider.calls, ordering.join(",")).toHaveLength(1);
      expect(f.provider.accepted.size).toBe(1);
    }
  });
  it("different intentional batches remain separate even with identical recipient and content", () => {
    const f = new ProposalFixture();
    for (const batch of ["batch1", "batch2"]) {
      f.commit(batch, "same body", ["a"]);
      f.claim(`${batch}/a`, 1);
      f.handoff(`${batch}/a`, 1, "accept");
    }
    expect(f.provider.accepted.size).toBe(2);
  });
});
