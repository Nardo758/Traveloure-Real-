/**
 * Operation Trailhead LANE T3.5 — the resolution PASS runner (the ONE service that owns the
 * waterfall — L6: all resolution orchestration lives here, the matchers are pure evidence producers
 * it composes).
 *
 * The pass classifies a published scraped stub's booking path in strict RUNG ORDER (R-T3-a):
 *   provider → affiliate_direct → affiliate_ota → external.
 * Provider wins whenever it matches — a stub matching a live platform provider links to that internal
 * listing and NEVER competes with it. Affiliate runs only if provider missed (and, with the shipped
 * config, every affiliate program is disabled ⇒ that rung is skipped). Otherwise the stub stays at the
 * external floor.
 *
 * Re-runnable (R-T3-c): a pass may UPGRADE a stub up the rungs; any DOWNGRADE (e.g. a provider listing
 * was un-approved between passes) is applied only WITH an append-only resolution_events audit row — a
 * downgrade is never silent. Every class change writes exactly one event in the same operation as the
 * flip. Same stubs + same catalogs + same config ⇒ same resolutions (determinism test).
 *
 * NO external API calls in the matching path (R-T3-b / R-T3-e): affiliate catalogs come from
 * feeds/config passed in, never a live scrape here. This session has NO DATABASE and NO network, so
 * runResolutionPass() is NOT run here — it is the ⚑ first-pass HARD STOP (T3.6), gated on the T2.4
 * verdict + T0. The PURE core (resolveStub / planTransition) is what the determinism test exercises.
 */

import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  dmoRawContent,
  providerServices,
  serviceCategories,
  resolutionEvents,
  type InsertResolutionEvent,
} from "@shared/schema";
import {
  qualifiedRung,
  isUpgrade,
  isDowngrade,
  defaultResolutionState,
  type ResolutionClass,
  type ResolutionSubclass,
  type ResolutionRung,
  type StubResolutionState,
} from "@shared/trailhead-resolution";
import {
  matchStubToProvider,
  type StubMatchInput,
  type ProviderServiceCandidate,
} from "./stub-provider-matcher";
import {
  matchStubToAffiliate,
  type AffiliateMatchInput,
  type AffiliateMatchOptions,
} from "./stub-affiliate-matcher";

// ── Pure core: one stub → one resolution decision (the waterfall) ─────────────────────────────────

export interface ResolutionDecision {
  resolutionClass: ResolutionClass;
  resolutionSubclass: ResolutionSubclass | null;
  /** Pointer for provider/affiliate rungs; NULL for external (the source URL is the row's own column). */
  resolutionRef: string | null;
  matchConfidence: number | null;
  rung: ResolutionRung;
  source: "provider" | "affiliate" | "external";
  evidence: Record<string, unknown> | null;
}

/**
 * Apply the rung order to ONE stub against its already-market-scoped provider candidates and the
 * (disabled-by-default) affiliate options. Provider first (R-T3-a); affiliate only if provider missed;
 * external floor otherwise. Pure + deterministic — no DB, no network, no clock.
 */
export function resolveStub(
  stub: StubMatchInput & AffiliateMatchInput,
  providerCandidates: ProviderServiceCandidate[],
  affiliateOptions?: AffiliateMatchOptions,
): ResolutionDecision {
  // Rung 1 — provider (never competed with, never outbound).
  const provider = matchStubToProvider(stub, providerCandidates);
  if (provider) {
    return {
      resolutionClass: "provider",
      resolutionSubclass: null,
      resolutionRef: provider.serviceId,
      matchConfidence: provider.confidence,
      rung: "provider",
      source: "provider",
      evidence: { ...provider.evidence },
    };
  }

  // Rungs 2 & 3 — affiliate_direct then affiliate_ota (disabled by default ⇒ null).
  const affiliate = matchStubToAffiliate(stub, affiliateOptions);
  if (affiliate) {
    return {
      resolutionClass: "affiliate",
      resolutionSubclass: affiliate.subclass,
      resolutionRef: affiliate.ref,
      matchConfidence: affiliate.confidence,
      rung: qualifiedRung("affiliate", affiliate.subclass),
      source: "affiliate",
      evidence: { ...affiliate.evidence, matchType: affiliate.matchType },
    };
  }

  // Rung 4 — external floor. No pointer stored (the source URL is dmo_raw_content.source_url).
  return {
    resolutionClass: "external",
    resolutionSubclass: null,
    resolutionRef: null,
    matchConfidence: null,
    rung: "external",
    source: "external",
    evidence: null,
  };
}

// ── Pure core: current state + decision → transition plan (upgrade/downgrade/relink/no-op) ─────────

export type TransitionKind = "initial" | "upgrade" | "downgrade" | "relink";

export interface TransitionPlan {
  changed: boolean;
  kind?: TransitionKind;
  fromRung: ResolutionRung;
  toRung: ResolutionRung;
  /** The audit row to append (minus pass_id, id, created_at, which the runner stamps). NULL if no change. */
  event?: Omit<InsertResolutionEvent, "id" | "passId" | "createdAt"> & { eventType: string };
}

/**
 * Decide whether a decision changes a stub's resolution, and classify the change. A change to a
 * strictly-higher rung is an UPGRADE; to a strictly-lower rung a DOWNGRADE (always audit-logged —
 * R-T3-c); a same-rung change of pointer is a RELINK; the first resolution off the born floor is
 * INITIAL. Identical rung AND identical ref ⇒ no change, no event.
 */
export function planTransition(current: StubResolutionState, decision: ResolutionDecision): TransitionPlan {
  const fromRung = qualifiedRung(current.resolutionClass, current.resolutionSubclass);
  const toRung = decision.rung;
  const sameRef = (current.resolutionRef ?? null) === (decision.resolutionRef ?? null);

  if (fromRung === toRung && sameRef) {
    return { changed: false, fromRung, toRung };
  }

  const bornFloor =
    current.resolutionClass === "external" && current.resolutionRef == null && current.resolvedAt == null;

  let kind: TransitionKind;
  if (isUpgrade(fromRung, toRung)) kind = "upgrade";
  else if (isDowngrade(fromRung, toRung)) kind = "downgrade";
  else kind = bornFloor ? "initial" : "relink";
  // A first move OUT of the untouched born floor reads as 'initial' even though external→provider is
  // technically an upgrade — 'initial' is the more informative audit label for a stub's first resolution.
  if (bornFloor && toRung !== "external") kind = "initial";

  return {
    changed: true,
    kind,
    fromRung,
    toRung,
    event: {
      stubId: "", // stamped by the runner (it holds the id)
      eventType: kind,
      fromClass: bornFloor ? null : fromRung,
      toClass: toRung,
      ref: decision.resolutionRef ?? null,
      confidence: decision.matchConfidence != null ? decision.matchConfidence.toFixed(2) : null,
    } as Omit<InsertResolutionEvent, "id" | "passId" | "createdAt"> & { eventType: string },
  };
}

// ── DB-bound runner (⚑ NOT run in this session — no DB/network) ────────────────────────────────────

export type PassMode = "full" | "delta";

export interface RunPassOptions {
  mode: PassMode;
  /** Optional city scope (case-insensitive); omit to run every published market. */
  city?: string;
  /** Affiliate options (catalogs/verified-direct); defaults to the disabled shipped registry. */
  affiliateOptions?: AffiliateMatchOptions;
}

export interface PassResult {
  passId: string;
  mode: PassMode;
  scanned: number;
  changed: number;
  upgrades: number;
  downgrades: number;
  byClass: Record<ResolutionClass, number>;
}

/**
 * Run one resolution pass. FULL re-evaluates every published stub in scope (can upgrade AND catch a
 * downgrade); DELTA touches only stubs still at the external floor (the cheap incremental pass a
 * newly-enabled program or a new batch triggers — it never re-touches an already-resolved row). For
 * each stub: load its market's approved provider candidates (joined to their category_key), run the
 * pure waterfall, and — if the decision changes the stub — write the resolution fields and append the
 * audit event in a single transaction.
 *
 * ⚑ HARD STOP: this is the T3.6 first pass. It waits on the T2.4 verdict + T0 and is NOT run here.
 */
export async function runResolutionPass(options: RunPassOptions): Promise<PassResult> {
  // Lazy DB import: keeps the pure core (resolveStub / planTransition) importable WITHOUT a
  // DATABASE_URL, so the determinism proofs run DB-free. The db module throws at import when no
  // database is provisioned, so it is only pulled in when a pass actually runs.
  const { db } = await import("../db");
  const passId = crypto.randomUUID();
  const result: PassResult = {
    passId,
    mode: options.mode,
    scanned: 0,
    changed: 0,
    upgrades: 0,
    downgrades: 0,
    byClass: { external: 0, provider: 0, affiliate: 0 },
  };

  // Published stubs in scope (mirrors passesDiscoverFilter: published + not rejected/quarantined).
  const stubWhere = [
    eq(dmoRawContent.discoverPageVisible, true),
    sql`${dmoRawContent.status} NOT IN ('rejected', 'quarantined')`,
  ];
  if (options.city) stubWhere.push(ilike(dmoRawContent.city, options.city));
  if (options.mode === "delta") stubWhere.push(eq(dmoRawContent.resolutionClass, "external"));

  const stubs = await db
    .select({
      id: dmoRawContent.id,
      name: dmoRawContent.name,
      contentType: dmoRawContent.contentType,
      city: dmoRawContent.city,
      country: dmoRawContent.country,
      latitude: dmoRawContent.latitude,
      longitude: dmoRawContent.longitude,
      resolutionClass: dmoRawContent.resolutionClass,
      resolutionSubclass: dmoRawContent.resolutionSubclass,
      resolutionRef: dmoRawContent.resolutionRef,
      matchConfidence: dmoRawContent.matchConfidence,
      resolvedAt: dmoRawContent.resolvedAt,
    })
    .from(dmoRawContent)
    .where(and(...stubWhere));

  // Provider candidates keyed by lowercased city — approved, live, joined to their category_key.
  const cities = Array.from(new Set(stubs.map((s) => (s.city ?? "").toLowerCase()).filter(Boolean)));
  const candidatesByCity = new Map<string, ProviderServiceCandidate[]>();
  if (cities.length > 0) {
    const rows = await db
      .select({
        id: providerServices.id,
        serviceName: providerServices.serviceName,
        latitude: providerServices.latitude,
        longitude: providerServices.longitude,
        city: providerServices.city,
        categoryKey: serviceCategories.categoryKey,
        approvalStatus: providerServices.approvalStatus,
      })
      .from(providerServices)
      .leftJoin(serviceCategories, eq(providerServices.categoryId, serviceCategories.id))
      .where(
        and(
          eq(providerServices.approvalStatus, "approved"),
          inArray(sql`lower(${providerServices.city})`, cities),
        ),
      );
    for (const r of rows) {
      const key = (r.city ?? "").toLowerCase();
      if (!candidatesByCity.has(key)) candidatesByCity.set(key, []);
      candidatesByCity.get(key)!.push({
        id: r.id,
        serviceName: r.serviceName,
        latitude: r.latitude,
        longitude: r.longitude,
        categoryKey: r.categoryKey ?? null,
        approvalStatus: r.approvalStatus ?? null,
      });
    }
  }

  for (const stub of stubs) {
    result.scanned++;
    const candidates = candidatesByCity.get((stub.city ?? "").toLowerCase()) ?? [];
    const decision = resolveStub(
      {
        id: stub.id,
        name: stub.name,
        contentType: stub.contentType,
        latitude: stub.latitude,
        longitude: stub.longitude,
      },
      candidates,
      options.affiliateOptions,
    );

    const current: StubResolutionState = {
      resolutionClass: (stub.resolutionClass as ResolutionClass) ?? defaultResolutionState().resolutionClass,
      resolutionSubclass: (stub.resolutionSubclass as ResolutionSubclass | null) ?? null,
      resolutionRef: stub.resolutionRef ?? null,
      matchConfidence: stub.matchConfidence != null ? Number(stub.matchConfidence) : null,
      resolvedAt: stub.resolvedAt ?? null,
    };

    const plan = planTransition(current, decision);
    result.byClass[decision.resolutionClass]++;
    if (!plan.changed) continue;

    result.changed++;
    if (plan.kind === "upgrade" || plan.kind === "initial") result.upgrades++;
    if (plan.kind === "downgrade") result.downgrades++;

    // Apply the flip + append the audit event atomically (the diary-in-the-same-transaction posture).
    await db.transaction(async (tx) => {
      await tx
        .update(dmoRawContent)
        .set({
          resolutionClass: decision.resolutionClass,
          resolutionSubclass: decision.resolutionSubclass,
          resolutionRef: decision.resolutionRef,
          matchConfidence: decision.matchConfidence != null ? decision.matchConfidence.toFixed(2) : null,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dmoRawContent.id, stub.id));

      if (plan.event) {
        await tx.insert(resolutionEvents).values({
          ...plan.event,
          stubId: stub.id,
          passId,
        } as InsertResolutionEvent);
      }
    });
  }

  return result;
}
