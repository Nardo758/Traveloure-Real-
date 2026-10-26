/**
 * THE VERSIONS BOARD's rules (surface step 5; spec v1.2 §2.4; rulings R-d, R-ac; ledger
 * `2026-10-04-surface-step5-map-versions`). Pure — read by the server's versions read and by the
 * client's board and map toggle, so a day's diff, a badge and a re-time count have ONE author (§18
 * rule 1).
 *
 *   · DAY DIFF BY ITEM ID: a version stop names the plan item it keeps (`sourceItemId`, migration
 *     343). moved = same id, different slot (another day, another position or another start);
 *     dropped = a plan item the version holds nowhere; added = a stop with no plan item behind it.
 *     An older run has no ids: stops then match by listing, then by title, and the day says
 *     "matched by name" — as does any day where two stops share a title (the collision the label is
 *     for), even on a new run.
 *   · BADGES: relative labels only, computed from each version's own stored stops (fixed for the
 *     run): "least travel" (straight-line path between located stops), "most time at stops" (stop
 *     durations), "earliest evenings" (the day's last end, averaged). A metric badges only a STRICT
 *     winner, only when every version has the data, and a card wears at most one badge. No minute,
 *     hour or distance value leaves (R-h).
 *   · FREE RE-TIMES (R-ac): `OPTIMIZER_FREE_RETIMES` (default 3) within 24 h of the paid run, same
 *     version. Past that, the re-time is a paid run and the UI says so BEFORE it happens.
 */

export interface BoardStop {
  /** A plan item id (plan) or a version item id (version). */
  id: string;
  /** Version stops only: the plan item this stop keeps (migration 343); null when none / unknown. */
  sourceItemId?: string | null;
  providerServiceId?: string | null;
  name: string;
  dayNumber: number;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  lat?: number | null;
  lng?: number | null;
  /**
   * Plan stops only: a FIXED point the optimizer never moves or drops (booked or checked out, expert
   * work, locked). It is not in any version by construction, so the diff leaves it out entirely —
   * never "dropped".
   */
  fixed?: boolean;
  /** Plan stops only: the version this row was adopted from (migration 343); null when never adopted. */
  sourceVariantId?: string | null;
}

export interface DayDiff {
  dayNumber: number;
  /** Version stop id → plan item id, for stops that keep a plan item in a different slot. */
  moved: Array<{ versionStopId: string; planItemId: string }>;
  /** Plan items on this day that the version holds NOWHERE. */
  dropped: string[];
  /** Version stops on this day with no plan item behind them. */
  added: string[];
  /** Kept in the same slot. */
  kept: Array<{ versionStopId: string; planItemId: string }>;
  identical: boolean;
  /** Any match on this day fell back to listing/title, or two stops share a title. */
  matchedByName: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const hhmm = (t: string | null | undefined) => (/^\d{2}:\d{2}/.test(t ?? "") ? (t as string).slice(0, 5) : null);

function byDay<T extends BoardStop>(stops: readonly T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const st of stops) {
    const list = m.get(st.dayNumber) ?? [];
    list.push(st);
    m.set(st.dayNumber, list);
  }
  return m;
}

/**
 * Match every version stop to a plan item: by `sourceItemId` first (only when the plan still holds
 * that id), then — for a stop with no usable id — by listing, then by title. Each plan item is
 * matched at most once. Returns version stop id → { planItemId, byName }.
 */
export function matchVersionStops(
  plan: readonly BoardStop[],
  version: readonly BoardStop[],
): Map<string, { planItemId: string; byName: boolean }> {
  const out = new Map<string, { planItemId: string; byName: boolean }>();
  const planIds = new Set(plan.map((p) => p.id));
  const used = new Set<string>();
  for (const v of version) {
    if (v.sourceItemId && planIds.has(v.sourceItemId) && !used.has(v.sourceItemId)) {
      out.set(v.id, { planItemId: v.sourceItemId, byName: false });
      used.add(v.sourceItemId);
    }
  }
  for (const v of version) {
    if (out.has(v.id)) continue;
    const viaListing = v.providerServiceId ? plan.find((p) => !used.has(p.id) && p.providerServiceId === v.providerServiceId) : undefined;
    const viaTitle = viaListing ?? plan.find((p) => !used.has(p.id) && norm(p.name) !== "" && norm(p.name) === norm(v.name));
    if (viaTitle) {
      out.set(v.id, { planItemId: viaTitle.id, byName: true });
      used.add(viaTitle.id);
    }
  }
  return out;
}

/** The day-by-day diff of one version against the plan. Days are the union of both sides. */
export function diffVersionDays(planAll: readonly BoardStop[], version: readonly BoardStop[]): DayDiff[] {
  const plan = planAll.filter((p) => !p.fixed);
  const match = matchVersionStops(plan, version);
  const planById = new Map(plan.map((p) => [p.id, p]));
  const matchedPlanIds = new Set(Array.from(match.values()).map((m) => m.planItemId));
  const planDays = byDay(plan);
  const versionDays = byDay(version);
  const days = Array.from(new Set([...Array.from(planDays.keys()), ...Array.from(versionDays.keys())])).sort((a, b) => a - b);
  return days.map((dayNumber) => {
    const vDay = versionDays.get(dayNumber) ?? [];
    const pDay = planDays.get(dayNumber) ?? [];
    const moved: DayDiff["moved"] = [];
    const kept: DayDiff["kept"] = [];
    const added: string[] = [];
    let matchedByName = false;
    vDay.forEach((v, position) => {
      const m = match.get(v.id);
      if (!m) {
        added.push(v.id);
        return;
      }
      if (m.byName) matchedByName = true;
      const p = planById.get(m.planItemId)!;
      const planPosition = pDay.findIndex((x) => x.id === p.id);
      const sameSlot = p.dayNumber === dayNumber && planPosition === position && hhmm(p.startTime) === hhmm(v.startTime);
      (sameSlot ? kept : moved).push({ versionStopId: v.id, planItemId: p.id });
    });
    const dropped = pDay.filter((p) => !matchedPlanIds.has(p.id)).map((p) => p.id);
    const vTitles = vDay.map((s) => norm(s.name)).filter(Boolean);
    const pTitles = pDay.map((s) => norm(s.name)).filter(Boolean);
    if (new Set(vTitles).size < vTitles.length || new Set(pTitles).size < pTitles.length) matchedByName = true;
    return {
      dayNumber,
      moved,
      dropped,
      added,
      kept,
      identical: moved.length === 0 && dropped.length === 0 && added.length === 0 && vDay.length === pDay.length,
      matchedByName,
    };
  });
}

/** The day's one-line change summary from its diff, e.g. "2 moved · 1 dropped · 1 added". */
export function daySummary(d: DayDiff): string {
  if (d.identical) return "Same as draft";
  const parts: string[] = [];
  if (d.moved.length) parts.push(`${d.moved.length} moved`);
  if (d.dropped.length) parts.push(`${d.dropped.length} dropped`);
  if (d.added.length) parts.push(`${d.added.length} added`);
  return parts.join(" · ") || "Reordered";
}

// ── badges ──────────────────────────────────────────────────────────────────────────────────────

export const BADGE_LABELS = {
  least_travel: "Least travel",
  most_time_at_stops: "Most time at stops",
  earliest_evenings: "Earliest evenings",
} as const;
export type BadgeKey = keyof typeof BADGE_LABELS;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const minutesOf = (t: string | null | undefined): number | null => {
  const h = hhmm(t);
  if (!h) return null;
  const [H, M] = h.split(":").map(Number);
  return H * 60 + M;
};

/** The three measures for one version. Null where the version's stops do not carry the data. */
export function versionMeasures(stops: readonly BoardStop[]): Record<BadgeKey, number | null> {
  const days = byDay(stops);
  let travel = 0;
  let travelKnown = false;
  for (const list of Array.from(days.values())) {
    const located = list.filter((s) => typeof s.lat === "number" && typeof s.lng === "number") as Array<BoardStop & { lat: number; lng: number }>;
    for (let i = 1; i < located.length; i++) {
      travel += metersBetween(located[i - 1], located[i]);
      travelKnown = true;
    }
  }
  let atStops = 0;
  let allTimed = stops.length > 0;
  for (const s of stops) {
    const d =
      s.durationMinutes ?? (minutesOf(s.endTime) != null && minutesOf(s.startTime) != null ? minutesOf(s.endTime)! - minutesOf(s.startTime)! : null);
    if (d == null || d <= 0) {
      allTimed = false;
      break;
    }
    atStops += d;
  }
  const lastEnds: number[] = [];
  let endsKnown = days.size > 0;
  for (const list of Array.from(days.values())) {
    const ends = list.map((s) => minutesOf(s.endTime) ?? minutesOf(s.startTime)).filter((x): x is number => x != null);
    if (!ends.length) {
      endsKnown = false;
      break;
    }
    lastEnds.push(Math.max(...ends));
  }
  return {
    least_travel: travelKnown ? travel : null,
    most_time_at_stops: allTimed ? atStops : null,
    earliest_evenings: endsKnown ? lastEnds.reduce((a, b) => a + b, 0) / lastEnds.length : null,
  };
}

/**
 * One badge per card, only where a metric has a STRICT winner and every version has the data.
 * Metrics are awarded in label order; a card that already wears a badge does not take a second.
 */
export function versionBadges(versions: ReadonlyArray<{ id: string; stops: readonly BoardStop[] }>): Map<string, BadgeKey> {
  const out = new Map<string, BadgeKey>();
  if (versions.length < 2) return out;
  const measures = versions.map((v) => ({ id: v.id, m: versionMeasures(v.stops) }));
  const order: Array<[BadgeKey, "min" | "max"]> = [
    ["least_travel", "min"],
    ["most_time_at_stops", "max"],
    ["earliest_evenings", "min"],
  ];
  for (const [key, dir] of order) {
    const vals = measures.map((x) => x.m[key]);
    if (vals.some((v) => v == null)) continue;
    const best = dir === "min" ? Math.min(...(vals as number[])) : Math.max(...(vals as number[]));
    const winners = measures.filter((x) => x.m[key] === best);
    if (winners.length !== 1) continue;
    if (out.has(winners[0].id)) continue;
    out.set(winners[0].id, key);
  }
  return out;
}

/**
 * "Recommended" (held-batch-1 item 22, decision-maker Oct 9, 2026: "strict winner by S1 tiebreak"). The
 * versions are ordered by S1's ranking rule (`rankStays`, `shared/stay-pick.ts`) over their OWN stops:
 * fewest unlocated stops (S1's "unreachable"), then the most days on which the version has the least
 * travel that day (each day's straight-line path between its located stops — the measure "least travel"
 * already uses), then the least total travel. Only a STRICT winner is recommended: a full tie on all
 * three keys recommends nothing, and names never break a tie (§13). Fewer than two versions, or a version
 * with no located stop at all, recommends nothing. No metre value leaves (R-h).
 */
export function recommendedVersion(versions: ReadonlyArray<{ id: string; stops: readonly BoardStop[] }>): string | null {
  if (versions.length < 2) return null;
  const rows = versions.map((v) => {
    const perDay = new Map<number, number>();
    let unlocated = 0;
    let located = 0;
    for (const [day, list] of Array.from(byDay(v.stops).entries())) {
      const pts = list.filter((s) => typeof s.lat === "number" && typeof s.lng === "number") as Array<BoardStop & { lat: number; lng: number }>;
      unlocated += list.length - pts.length;
      located += pts.length;
      let m = 0;
      for (let i = 1; i < pts.length; i++) m += metersBetween(pts[i - 1], pts[i]);
      perDay.set(day, m);
    }
    const total = Array.from(perDay.values()).reduce((a, b) => a + b, 0);
    return { id: v.id, unlocated, located, perDay, total, closestDays: 0 };
  });
  if (rows.some((r) => r.located === 0)) return null;
  const days = new Set<number>();
  for (const r of rows) for (const d of Array.from(r.perDay.keys())) days.add(d);
  for (const d of Array.from(days)) {
    if (rows.some((r) => !r.perDay.has(d))) continue;
    const best = Math.min(...rows.map((r) => r.perDay.get(d)!));
    const winners = rows.filter((r) => r.perDay.get(d) === best);
    if (winners.length === 1) winners[0].closestDays += 1;
  }
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.unlocated - b.unlocated || b.closestDays - a.closestDays || a.total - b.total;
  const sorted = [...rows].sort(cmp);
  return cmp(sorted[0], sorted[1]) < 0 ? sorted[0].id : null;
}

// ── free re-times (R-ac) ────────────────────────────────────────────────────────────────────────

export const FREE_RETIME_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Is a re-time still free? Inside 24 h of the paid run and under the limit for that version. */
export function retimeIsFree(input: { runAt: Date | string | null; now: Date; used: number; limit: number; unlimited?: boolean }): boolean {
  if (!input.runAt) return false;
  const runAt = new Date(input.runAt).getTime();
  if (!Number.isFinite(runAt)) return false;
  // R-ac (step 6): a Trip Pass holder's re-times are unlimited within the same 24-hour window.
  return input.now.getTime() - runAt <= FREE_RETIME_WINDOW_MS && (input.unlimited === true || input.used < input.limit);
}

/** The board's line about re-times, said BEFORE one happens. */
export function retimeLine(input: { free: boolean; remaining: number; feeLabel: string | null; unlimited?: boolean }): string {
  // V-1: a Trip Pass holder's re-times are unlimited inside the window — no count is shown.
  if (input.free && input.unlimited) return "Re-timing a day is free";
  if (input.free) return `Re-timing a day is free · ${input.remaining} left`;
  return input.feeLabel ? `Re-timing now is a paid run · Optimize · ${input.feeLabel}` : "Re-timing now is a paid run";
}

/** Version labels by run order (sortOrder 1, 2, 3 ⇒ A, B, C). */
export function versionLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

// ── the run's charge (held-batch-1 item 23) ─────────────────────────────────────────────────────

/** What the latest run cost, read from its `fee_ledger` toll rows (LD 41 amended). */
export interface RunCharge {
  basis: "paid" | "trip_pass" | "free_rerun";
  amountCents: number;
  currency: string;
  at: string;
}

export interface RunTollRow {
  id: string;
  feeType: string;
  amount: string | number;
  currency: string | null;
  createdAt: Date | string;
  stripePaymentRef: string | null;
  reversesLedgerId?: string | null;
  metadata: Record<string, unknown> | null;
}

/** A run's toll is written at the run point, before its versions; allow the run that long. */
export const RUN_TOLL_MATCH_WINDOW_MS = 10 * 60_000;

/**
 * PURE: the charge for the run dated `runAt`, from the comparison's optimizer toll rows. The newest
 * `ai_concierge_fee` row written no later than the run (plus the match window) is the run's toll.
 * A `fee_waiver` on the same run id names what covered it; otherwise a PaymentIntent on the row
 * makes it paid. NULL when there is no row, the row was reversed, or its basis can't be read — the
 * board then says nothing about money (§13), never "free".
 */
export function runChargeFromLedger(rows: readonly RunTollRow[], runAt: Date | string): RunCharge | null {
  const runMs = new Date(runAt).getTime();
  if (!Number.isFinite(runMs)) return null;
  const ms = (r: RunTollRow) => new Date(r.createdAt).getTime();
  const fee = rows
    .filter((r) => r.feeType === "ai_concierge_fee" && Number.isFinite(ms(r)) && ms(r) <= runMs + RUN_TOLL_MATCH_WINDOW_MS)
    .sort((a, b) => ms(b) - ms(a))[0];
  if (!fee) return null;
  if (rows.some((r) => r.reversesLedgerId === fee.id)) return null;
  const amountCents = Math.round(Number(fee.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  const currency = (fee.currency || "usd").toLowerCase();
  const at = new Date(fee.createdAt).toISOString();
  const runId = typeof fee.metadata?.runId === "string" ? fee.metadata.runId : null;
  if (runId) {
    const waiver = rows.find((r) => r.feeType === "fee_waiver" && r.metadata?.runId === runId);
    const by = waiver?.metadata?.covered_by;
    if (by === "trip_pass" || by === "free_rerun") return { basis: by, amountCents, currency, at };
    return null;
  }
  return fee.stripePaymentRef ? { basis: "paid", amountCents, currency, at } : null;
}

// ── replaced-day restore (ledger 2026-10-25-d3-restore-day) ─────────────────────────────────────
//
// Retention, Architect 2026-10-25 20:35 ET: a snapshot lives 14 days; only the newest snapshot per
// day is live (a newer apply supersedes the older); expired rows are purged lazily at the next
// apply on that trip. No new job.

/** How long a replaced day stays restorable. */
export const DAY_RESTORE_RETENTION_DAYS = 14;
export const DAY_RESTORE_RETENTION_MS = DAY_RESTORE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** What GET /versions/restorable says about the newest live snapshot of a day. */
export type DayRestoreState = "restorable" | "changed_since" | "expired" | "finalized";

export interface DaySignatureRow {
  id: string;
  dayNumber: number | string | null;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number | string | null;
  title: string | null;
  updatedAt: Date | string | null;
}

function signatureInstant(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function signatureField(value: number | string | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * PURE. sha256 over the day's rows sorted by id:
 * `id|day_number|start_time|end_time|sort_order|title|updated_at`.
 * Restore is allowed only while the live day still hashes to the value stored at apply.
 * UTF-8, no Node import — this module is also bundled for the versions board.
 */
export function dayAfterSignature(rows: readonly DaySignatureRow[]): string {
  const lines = [...rows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) =>
      [
        r.id,
        signatureField(r.dayNumber),
        signatureField(r.startTime),
        signatureField(r.endTime),
        signatureField(r.sortOrder),
        signatureField(r.title),
        signatureInstant(r.updatedAt),
      ].join("|"),
    );
  return sha256Hex(lines.join("\n"));
}

/** True when `expires_at` has passed. A superseded snapshot is a separate fact. */
export function daySnapshotExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (expiresAt == null) return true;
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}

/**
 * PURE. The state's order is the restore route's order: a finalized plan, then expiry,
 * then a day that no longer matches the signature stored at apply, then restorable.
 */
export function dayRestoreState(input: {
  finalized: boolean;
  expiresAt: Date | string | null;
  now: Date;
  afterSignature: string;
  currentSignature: string;
}): DayRestoreState {
  if (input.finalized) return "finalized";
  if (daySnapshotExpired(input.expiresAt, input.now)) return "expired";
  if (input.currentSignature !== input.afterSignature) return "changed_since";
  return "restorable";
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** sha256 hex of a UTF-8 string. Pure so the client bundle of this module does not import Node. */
function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const zeroCount = (56 - ((bytes.length + 1) % 64) + 64) % 64;
  const total = bytes.length + 1 + zeroCount + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < buf.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[j] + w[j]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}
