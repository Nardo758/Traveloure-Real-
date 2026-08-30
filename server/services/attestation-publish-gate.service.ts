/**
 * SS-5a — THE ATTESTATION PUBLISH GATE (docs/DECISIONS.md ruling 69 disposition 3).
 *
 * Ruling 67 built D9's attestations and gated NOTHING, deliberately: ruling 62 ratified
 * attestations *keyed to method and category* and said nothing about a publish gate, so the
 * question went to the decision-maker as SS-5a with three options. The disposition is option (b):
 * **a new or edited listing cannot go ACTIVE while an applicable attestation is unaffirmed**, with
 * existing active listings GRANDFATHERED — nudged, never auto-unpublished.
 *
 * ── WHERE IT FIRES ───────────────────────────────────────────────────────────────────────────
 * The SAME three choke points the F2 verification gate uses, and for the same reason: those are
 * the only doors to `status:'active'` (POST /api/provider/services, PATCH /api/provider/services/
 * :id, and the owner's own Activate toggle). The gate is placed BESIDE `checkPublishVerification
 * Gate` at each of them, so a fourth door added later inherits the pair or neither.
 *
 * ── GRANDFATHERING IS A TRANSITION RULE, NOT AN EXEMPTION LIST ───────────────────────────────
 * The gate fires only on a transition TO active. A listing already `active` is never evaluated —
 * not on an edit, not on a re-save — so nothing that is live today can be knocked off by this, and
 * no back-dated exemption table is needed. That is the whole grandfathering mechanism.
 *
 * ── THE APPLICABLE SET IS STILL SERVER-DERIVED (ruling 67 §1, unchanged) ─────────────────────
 * Applicability is re-resolved from the shape the listing WILL HAVE after this save — the live row
 * merged with the write's own fields — by the SHARED `resolveApplicableAttestations`. A client
 * never decides what applies to itself, and the gate therefore cannot be walked past by omitting a
 * field. §13 stands: an UNDECIDABLE key (omitted with a reason) is **not** gated on, because the
 * platform cannot demand a statement about a condition it cannot say applies.
 *
 * ── WHY AFFIRMATIONS MAY TRAVEL WITH THE WRITE ──────────────────────────────────────────────
 * An affirmation is a CHILD ROW keyed by service id, so on a CREATE there is no row to attach one
 * to yet — the wizard's existing flow saves first and affirms second. A gate evaluated before the
 * save would therefore make an applicable listing unpublishable on first create, forever. So the
 * write accepts an explicit ALLOWLIST field (`affirmAttestations: string[]`) carrying the keys the
 * provider ticked. This is NOT a client deciding applicability: every key is re-validated against
 * the server-resolved set exactly as `POST …/attestations` validates it, an unknown or
 * inapplicable key is refused, and the recorded row is stamped with the SESSION user (§14).
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { providerServices, serviceCategories } from "@shared/schema";
import {
  ATTESTATION_CATALOG,
  isAttestationKey,
  resolveApplicableAttestations,
  type AttestationKey,
  type AttestationShape,
} from "@shared/service-attestations";

/**
 * Resolve a listing's attestation SHAPE from the DB, optionally overlaid with the fields a write
 * is about to change. ONE assembler for the read surface, the affirm surface and this gate — a
 * second one is precisely the drift `shared/service-attestations.ts` was placed to prevent.
 *
 * `overrides` uses `undefined` to mean "not part of this write" and `null` to mean "being cleared".
 */
export async function resolveAttestationShape(opts: {
  serviceId?: string | null;
  overrides?: {
    deliveryMethod?: string | null;
    productShape?: string | null;
    categoryId?: string | null;
  };
}): Promise<AttestationShape> {
  let deliveryMethod: string | null = null;
  let productShape: string | null = null;
  let categoryId: string | null = null;

  if (opts.serviceId) {
    const [row] = await db
      .select({
        deliveryMethod: providerServices.deliveryMethod,
        productShape: providerServices.productShape,
        categoryId: providerServices.categoryId,
      })
      .from(providerServices)
      .where(eq(providerServices.id, opts.serviceId));
    deliveryMethod = row?.deliveryMethod ?? null;
    productShape = row?.productShape ?? null;
    categoryId = row?.categoryId ?? null;
  }

  const o = opts.overrides ?? {};
  if (o.deliveryMethod !== undefined) deliveryMethod = o.deliveryMethod;
  if (o.productShape !== undefined) productShape = o.productShape;
  if (o.categoryId !== undefined) categoryId = o.categoryId;

  let categoryKey: string | null = null;
  let categorySlug: string | null = null;
  if (categoryId) {
    const [cat] = await db
      .select({ categoryKey: serviceCategories.categoryKey, slug: serviceCategories.slug })
      .from(serviceCategories)
      .where(eq(serviceCategories.id, categoryId));
    categoryKey = cat?.categoryKey ?? null;
    categorySlug = cat?.slug ?? null;
  }

  return { deliveryMethod, productShape, categoryKey, categorySlug };
}

/**
 * The §19 allowlist read of the affirmations travelling with a listing write. Exactly one field,
 * an array of strings, nothing else off the body. Returns `null` when the field is absent.
 */
export function readAffirmAttestationsField(body: unknown): string[] | null {
  const raw = (body as any)?.affirmAttestations;
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((v: unknown): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)),
  ).slice(0, 16);
}

export interface GateRefusal {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Validate the keys a write asks to affirm, against the server-resolved applicable set.
 * Mirrors `POST /api/provider/services/:id/attestations` exactly — same codes, same §13 refusals.
 */
export function validateAffirmKeys(
  requested: string[],
  shape: AttestationShape,
): { ok: true; keys: AttestationKey[] } | { ok: false; refusal: GateRefusal } {
  const resolution = resolveApplicableAttestations(shape);
  const applicable = new Set<string>(resolution.applicable);
  const omittedByKey = new Map(resolution.omitted.map((o) => [o.key as string, o]));

  for (const key of requested) {
    if (!isAttestationKey(key)) {
      return {
        ok: false,
        refusal: { status: 400, body: { message: `Unknown attestation "${key}"`, code: "UNKNOWN_ATTESTATION", key } },
      };
    }
    if (!applicable.has(key)) {
      const omission = omittedByKey.get(key);
      return {
        ok: false,
        refusal: {
          status: 400,
          body: {
            message: omission
              ? `"${key}" cannot be affirmed for this listing — ${omission.reason.en}`
              : `"${key}" does not apply to this listing`,
            code: omission ? "ATTESTATION_UNDECIDABLE" : "ATTESTATION_NOT_APPLICABLE",
            key,
            ...(omission ? { reason: omission.reason.en, omissionCode: omission.code } : {}),
          },
        },
      };
    }
  }
  return { ok: true, keys: requested as AttestationKey[] };
}

/**
 * THE GATE. Returns null when the write may proceed to `active`; otherwise the exact 403 to send.
 *
 * `affirmingNow` is the already-validated set travelling with this write — counted as affirmed
 * because it will be recorded by the same request. On a create there is nothing else to count.
 */
export async function checkAttestationPublishGate(opts: {
  serviceId?: string | null;
  shape: AttestationShape;
  affirmingNow?: readonly AttestationKey[];
}): Promise<GateRefusal | null> {
  const resolution = resolveApplicableAttestations(opts.shape);
  if (resolution.applicable.length === 0) return null;

  const affirmed = new Set<string>(opts.affirmingNow ?? []);
  if (opts.serviceId) {
    for (const row of await storage.getServiceAttestations(opts.serviceId)) {
      affirmed.add(row.attestationKey);
    }
  }

  const unaffirmed = resolution.applicable.filter((key) => !affirmed.has(key));
  if (unaffirmed.length === 0) return null;

  return {
    status: 403,
    body: {
      message:
        "Confirm the statements on this listing before publishing it. They are your own statements — Traveloure does not verify them.",
      code: "ATTESTATION_GATE",
      // The keys, so a client can point at the exact rows rather than saying "something is wrong".
      unaffirmed,
      // The localized label pair travels with the refusal for the same reason the READ surface
      // carries it: the wizard renders a provider's own language, and an EN-only refusal inside an
      // otherwise-Japanese card is the mixed-copy failure I18N-2 names.
      attestations: unaffirmed.map((key) => ({ key, label: ATTESTATION_CATALOG[key].label })),
    },
  };
}
