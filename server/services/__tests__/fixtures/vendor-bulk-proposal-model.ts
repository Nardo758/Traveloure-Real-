/**
 * Executable specification ONLY. No database, production imports, worker,
 * scheduler or provider SDK. This models atomic operations, not SQL locking.
 * Approval and real isolated-Postgres proofs remain required before conversion.
 */
export type Outcome = "reject" | "accept" | "accept-timeout";
export class MockProvider {
  calls: string[] = [];
  accepted = new Map<string, string>();
  payloads = new Map<string, string>();
  send(key: string, payload: string, outcome: Outcome) {
    this.calls.push(key);
    const previous = this.payloads.get(key);
    if (previous !== undefined && previous !== payload) throw new Error("provider key payload changed");
    if (outcome === "reject") return false;
    this.payloads.set(key, payload);
    if (!this.accepted.has(key)) this.accepted.set(key, `mock-${this.accepted.size + 1}`);
    if (outcome === "accept-timeout") throw new Error("unknown acceptance");
    return true;
  }
}

type Obligation = {
  payload: string;
  state: "pending" | "processing" | "failed" | "sent" | "held";
  lease: number;
  firstAttempt?: number;
  historyPending: boolean;
};

export class ProposalFixture {
  // Test oracle for future batch receipt + main outbox rows, not another outbox.
  batches = new Map<string, string>();
  rows = new Map<string, Obligation>();
  logs = new Set<string>();
  provider = new MockProvider();
  now = 0;
  // Conservative synthetic window. This is NOT provider documentation/certification.
  safeRetryWindow = 23 * 60 * 60 * 1000;
  commit(batch: string, payload: string, recipients: string[], fail = false) {
    const fingerprint = JSON.stringify([payload, [...new Set(recipients)].sort()]);
    const prior = this.batches.get(batch);
    if (prior !== undefined && prior !== fingerprint) throw new Error("409 batch identity conflict");
    if (fail) throw new Error("atomic commit aborted");
    this.batches.set(batch, fingerprint);
    for (const recipient of new Set(recipients)) {
      const key = `${batch}/${recipient}`;
      if (!this.rows.has(key)) this.rows.set(key, {
        payload, state: "pending", lease: 0, historyPending: false,
      });
    }
  }
  claim(key: string, owner: number) {
    const row = this.rows.get(key)!;
    if (!["pending", "failed"].includes(row.state)) return false;
    row.state = "processing";
    row.lease = owner;
    return true;
  }
  expire(key: string) {
    const row = this.rows.get(key)!;
    if (row.state === "processing") row.state = "failed";
  }
  handoff(key: string, owner: number, outcome: Outcome, loseStamp = false) {
    const row = this.rows.get(key)!;
    if (row.state !== "processing" || row.lease !== owner) return false;
    if (row.firstAttempt !== undefined && this.now - row.firstAttempt >= this.safeRetryWindow) {
      row.state = "held";
      return false;
    }
    row.firstAttempt ??= this.now; // Durable BEFORE provider handoff.
    let accepted: boolean;
    try {
      accepted = this.provider.send(key, row.payload, outcome);
    } catch {
      row.state = "failed";
      return false;
    }
    if (loseStamp) return accepted;
    this.finish(key, owner, accepted);
    return accepted;
  }
  finish(key: string, owner: number, accepted: boolean) {
    const row = this.rows.get(key)!;
    if (row.state !== "processing" || row.lease !== owner) return false;
    row.state = accepted ? "sent" : "failed";
    row.historyPending = accepted;
    return true;
  }
  repairHistory(key: string, fail = false) {
    const row = this.rows.get(key)!;
    if (!row.historyPending || fail) return;
    this.logs.add(key); // Future atomic append keyed by obligation, under contract lock.
    row.historyPending = false;
  }
}
