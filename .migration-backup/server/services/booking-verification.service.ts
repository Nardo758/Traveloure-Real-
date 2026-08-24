/**
 * AI booking copilot — verification leg (decision-maker ratified).
 *
 * When a booking agent (expert) handles an affiliate booking request (the §16 agent rail —
 * Model C partners), this verifies the partner product is STILL available at the quoted price
 * BEFORE the human books: Tavily-extracts the partner product page server-side, diffs it against
 * what the traveler requested, and writes a verified-as-of-now snapshot onto the request.
 *
 * The HUMAN still makes the purchase — this lane never automates a booking (partner ToS +
 * affiliate-fraud posture). This module only READS the partner page and WRITES an advisory
 * snapshot; it never calls back to the partner to reserve/purchase anything.
 *
 * §16: the partner `affiliateUrl` is resolved SERVER-SIDE ONLY (the row already stores it
 * server-side — content.routes.ts writes it at create/resolution and never returns it to
 * clients). The verification snapshot this module produces and persists NEVER includes that URL —
 * enforced structurally below (the snapshot object is built field-by-field; the URL is a local
 * variable that never flows into it).
 *
 * §13: best-effort, never fabricates. No TAVILY_API_KEY / no ANTHROPIC_API_KEY / a page that
 * doesn't clearly state a fact ⇒ that fact is `null`, never guessed. No key ⇒ zero writes.
 *
 * Mirrors server/services/dmo-ingestion.service.ts's key-gating + Tavily-extract client pattern,
 * and server/services/expertise-scoring.service.ts's Anthropic-client + defensive-JSON-parse
 * pattern (both are the established precedents for this class of service).
 */
import Anthropic from "@anthropic-ai/sdk";
import { tavily, type TavilyClient } from "tavily";
import { storage } from "../storage";
import { trackAnthropicResponse } from "./ai-cost-tracker";
import { logger } from "../infrastructure/logger";

const MODEL = process.env.BOOKING_VERIFICATION_MODEL || "claude-sonnet-5";
const MAX_PAGE_CHARS = 8000; // keep the extraction prompt lean

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

export type AvailabilitySignal = "bookable" | "sold_out" | "unclear";
export type VerificationVerdict = "verified" | "flagged" | "unclear";

export type VerificationFlag =
  | { type: "price_drift"; seen: number; current: number }
  | { type: "possibly_sold_out" }
  | { type: "date_unavailable" }
  | { type: "unclear" };

export interface VerificationSnapshot {
  verifiedAt: string; // ISO timestamp
  price: number | null;
  currency: string | null;
  availability: AvailabilitySignal | null;
  dateAvailable: boolean | null; // null when no travelDate on the request, or the page doesn't say
  cancellation: string | null;
  operatingHours: string | null;
  verdict: VerificationVerdict;
  flags: VerificationFlag[];
  agentNote: string;
  source: "tavily+llm";
}

export interface VerifyBookingRequestResult {
  available: boolean;
  reason?: string;
  snapshot?: VerificationSnapshot;
}

// ── Extracted page facts (LLM output shape, pre-diff) ────────────────────────────────────────

export interface ExtractedFacts {
  price: number | null;
  currency: string | null;
  availability: AvailabilitySignal;
  dateAvailable: boolean | null;
  cancellationTerms: string | null;
  operatingHours: string | null;
  parsed: boolean; // false ⇒ unparseable model output, every field above is a safe default
}

// ── Key gating (§13) ─────────────────────────────────────────────────────────────────────────

export function isBookingVerificationReady(): boolean {
  return !!process.env.TAVILY_API_KEY && !!process.env.ANTHROPIC_API_KEY;
}

function getTavilyClient(): TavilyClient {
  return tavily({ apiKey: process.env.TAVILY_API_KEY as string });
}

// ── Throttling (one in-flight + ~1/min per request — Tavily + LLM calls cost real money) ──────

const MIN_REVERIFY_INTERVAL_MS = 60_000;
const inFlight = new Set<string>();
const lastAttemptAt = new Map<string, number>();

export class VerificationInFlightError extends Error {
  constructor() {
    super("A verification is already in progress for this request");
    this.name = "VerificationInFlightError";
  }
}
export class VerificationThrottledError extends Error {
  constructor(public retryAfterMs: number) {
    super("Please wait before re-verifying this request");
    this.name = "VerificationThrottledError";
  }
}

/** Test-only escape hatch — clears throttle/in-flight state between test cases. */
export function __resetVerificationThrottleForTests(): void {
  inFlight.clear();
  lastAttemptAt.clear();
}

// ── Extraction prompt ────────────────────────────────────────────────────────────────────────

function buildExtractionPrompt(pageText: string, travelDate: string | null): string {
  const dateInstruction = travelDate
    ? `The traveler wants to book for ${travelDate}. If the page clearly states whether that date ` +
      `is available/bookable, set "dateAvailable" to true or false. If the page says nothing that ` +
      `clearly resolves availability for that specific date, set "dateAvailable" to null.`
    : `No specific travel date was requested. Set "dateAvailable" to null.`;

  return (
    `You are extracting FACTS from a travel/activity partner product page for a pre-booking safety check. ` +
    `Read the page text below and extract ONLY what it clearly states. NEVER guess or infer a fact that ` +
    `isn't clearly present — if the page doesn't say it, the field must be null.\n\n` +
    `FIELDS:\n` +
    `- "price": the current numeric price shown for this product (number, no currency symbol), or null if unclear.\n` +
    `- "currency": the ISO-ish currency code/symbol context (e.g. "USD", "EUR"), or null if unclear.\n` +
    `- "availability": one of "bookable" (the page indicates it can currently be booked), "sold_out" ` +
    `(the page indicates it is sold out / unavailable / fully booked), or "unclear" (the page does not ` +
    `clearly say either way).\n` +
    `- "dateAvailable": ${dateInstruction}\n` +
    `- "cancellationTerms": a short (<200 char) quote/paraphrase of the cancellation policy if stated, else null.\n` +
    `- "operatingHours": a short (<200 char) quote/paraphrase of operating hours/dates if stated, else null.\n\n` +
    `PAGE TEXT:\n"""\n${pageText.slice(0, MAX_PAGE_CHARS)}\n"""\n\n` +
    `Return ONLY strict minified JSON, no prose, no markdown fences, of the exact form: ` +
    `{"price":null,"currency":null,"availability":"unclear","dateAvailable":null,"cancellationTerms":null,"operatingHours":null}`
  );
}

export function safeParseExtractedFacts(raw: string): ExtractedFacts {
  try {
    const cleaned = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no JSON object found");
    const parsed = JSON.parse(cleaned.slice(start, end + 1));

    const price = typeof parsed.price === "number" && Number.isFinite(parsed.price) ? parsed.price : null;
    const currency = typeof parsed.currency === "string" && parsed.currency.trim() ? parsed.currency.trim().slice(0, 10) : null;
    const availability: AvailabilitySignal =
      parsed.availability === "bookable" || parsed.availability === "sold_out" ? parsed.availability : "unclear";
    const dateAvailable = typeof parsed.dateAvailable === "boolean" ? parsed.dateAvailable : null;
    const cancellationTerms =
      typeof parsed.cancellationTerms === "string" && parsed.cancellationTerms.trim()
        ? parsed.cancellationTerms.trim().slice(0, 280)
        : null;
    const operatingHours =
      typeof parsed.operatingHours === "string" && parsed.operatingHours.trim()
        ? parsed.operatingHours.trim().slice(0, 280)
        : null;

    return { price, currency, availability, dateAvailable, cancellationTerms, operatingHours, parsed: true };
  } catch {
    // Unparseable output — never fabricate. Every field is the honest "we don't know" default.
    return {
      price: null,
      currency: null,
      availability: "unclear",
      dateAvailable: null,
      cancellationTerms: null,
      operatingHours: null,
      parsed: false,
    };
  }
}

// ── Diff + note drafting ─────────────────────────────────────────────────────────────────────

export function buildFlagsAndVerdict(
  facts: ExtractedFacts,
  seenPrice: number | null,
): { flags: VerificationFlag[]; verdict: VerificationVerdict } {
  const flags: VerificationFlag[] = [];

  if (facts.price !== null && seenPrice !== null && Math.abs(facts.price - seenPrice) > 0.001) {
    flags.push({ type: "price_drift", seen: seenPrice, current: facts.price });
  }
  if (facts.availability === "sold_out") {
    flags.push({ type: "possibly_sold_out" });
  }
  if (facts.dateAvailable === false) {
    flags.push({ type: "date_unavailable" });
  }
  if (!facts.parsed || facts.availability === "unclear") {
    flags.push({ type: "unclear" });
  }

  const hardFlags = flags.filter((f) => f.type !== "unclear");
  let verdict: VerificationVerdict;
  if (!facts.parsed) {
    verdict = "unclear";
  } else if (hardFlags.length > 0) {
    verdict = "flagged";
  } else if (facts.availability === "unclear") {
    verdict = "unclear";
  } else {
    verdict = "verified";
  }

  return { flags, verdict };
}

export function draftAgentNote(
  itemName: string,
  partnerName: string,
  facts: ExtractedFacts,
  flags: VerificationFlag[],
  verdict: VerificationVerdict,
): string {
  if (!facts.parsed) {
    return (
      `Could not read a clear product status from ${partnerName}'s page for "${itemName}" — ` +
      `please double-check availability and price directly before booking.`
    );
  }

  const parts: string[] = [];
  parts.push(
    facts.price !== null
      ? `Current price on ${partnerName}: ${facts.currency ?? ""} ${facts.price}`.trim() + "."
      : `Price not clearly stated on ${partnerName}'s page.`,
  );
  parts.push(
    facts.availability === "bookable"
      ? "Page indicates it is currently bookable."
      : facts.availability === "sold_out"
        ? "Page indicates this may be sold out or unavailable."
        : "Availability was not clearly stated.",
  );
  if (facts.dateAvailable === false) {
    parts.push("The requested travel date does not appear to be available.");
  }
  if (facts.cancellationTerms) {
    parts.push(`Cancellation: ${facts.cancellationTerms}`);
  }
  const priceDrift = flags.find((f): f is Extract<VerificationFlag, { type: "price_drift" }> => f.type === "price_drift");
  if (priceDrift) {
    parts.push(
      `⚠ Price differs from what the traveler was shown (was ${priceDrift.seen}, now ${priceDrift.current}) — confirm with the traveler before booking.`,
    );
  }
  if (verdict === "flagged") {
    parts.push("Recommend confirming directly with the partner before finalizing this booking.");
  }
  return parts.join(" ");
}

// ── Main entry point ─────────────────────────────────────────────────────────────────────────

// Minimal shape this module needs from storage — lets tests inject an in-memory double instead of
// hitting the real DB (mirrors the tavilyClient/anthropicClient override pattern below).
export interface BookingVerificationStorage {
  getAffiliateBookingRequestById: (id: string) => Promise<any>;
  setAffiliateBookingRequestVerification: (id: string, verification: Record<string, unknown>) => Promise<any>;
}

export interface VerifyBookingRequestDeps {
  tavilyClient?: TavilyClient;
  anthropicClient?: Anthropic;
  storage?: BookingVerificationStorage;
}

/**
 * Verify a single affiliate booking request. Resolves the partner URL server-side, Tavily-extracts
 * the page, LLM-extracts current facts, diffs against the request, persists the snapshot, and
 * returns it. Returns `{available:false, reason:...}` — and writes NOTHING — when a required key is
 * absent, the request doesn't exist, or the page/extract step fails outright.
 */
export async function verifyBookingRequest(
  requestId: string,
  deps: VerifyBookingRequestDeps = {},
): Promise<VerifyBookingRequestResult> {
  if (inFlight.has(requestId)) {
    throw new VerificationInFlightError();
  }
  const last = lastAttemptAt.get(requestId);
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < MIN_REVERIFY_INTERVAL_MS) {
      throw new VerificationThrottledError(MIN_REVERIFY_INTERVAL_MS - elapsed);
    }
  }

  const store = deps.storage ?? storage;
  const request = await store.getAffiliateBookingRequestById(requestId);
  if (!request) {
    return { available: false, reason: "request_not_found" };
  }

  if (!isBookingVerificationReady()) {
    return { available: false, reason: "verification_unavailable" };
  }

  // Claim the slot + start the throttle clock BEFORE the paid calls, so a duplicate/concurrent
  // caller can't also spend Tavily/LLM credits on the same request.
  inFlight.add(requestId);
  lastAttemptAt.set(requestId, Date.now());

  try {
    // §16: affiliateUrl is read here, server-side only, and is a local variable that is never
    // written into the snapshot object below.
    const partnerUrl = request.affiliateUrl;
    if (!partnerUrl) {
      return { available: false, reason: "no_partner_url" };
    }

    const tavilyClient = deps.tavilyClient ?? getTavilyClient();
    let pageText: string | undefined;
    try {
      const extract = await tavilyClient.extract([partnerUrl], {
        format: "markdown",
        extractDepth: "advanced",
      });
      pageText = extract.results?.[0]?.rawContent?.trim();
    } catch (err: any) {
      logger.error(`[booking-verification] Tavily extract failed for request ${requestId}: ${err?.message ?? err}`);
      return { available: false, reason: "partner_page_unreachable" };
    }
    if (!pageText) {
      return { available: false, reason: "partner_page_unreachable" };
    }

    const anthropicClient = deps.anthropicClient ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const travelDate = request.travelDate ?? null;
    const prompt = buildExtractionPrompt(pageText, travelDate);

    let facts: ExtractedFacts;
    try {
      const resp = await anthropicClient.messages.create({
        model: MODEL,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      trackAnthropicResponse(resp, { sourceType: "ai_expert", userId: request.expertId ?? null, requestId });
      const text = resp.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").trim();
      facts = safeParseExtractedFacts(text);
    } catch (err: any) {
      logger.error(`[booking-verification] LLM extraction failed for request ${requestId}: ${err?.message ?? err}`);
      // Unparseable/failed extraction is honestly "unclear" — not a hard failure. We still have a
      // real page fetch to acknowledge, so we produce an unclear snapshot rather than refusing.
      facts = {
        price: null,
        currency: null,
        availability: "unclear",
        dateAvailable: null,
        cancellationTerms: null,
        operatingHours: null,
        parsed: false,
      };
    }

    const seenPrice = request.price !== null && request.price !== undefined ? Number(request.price) : null;
    const { flags, verdict } = buildFlagsAndVerdict(facts, Number.isFinite(seenPrice as number) ? seenPrice : null);
    const agentNote = draftAgentNote(request.itemName, request.partnerName, facts, flags, verdict);

    const snapshot: VerificationSnapshot = {
      verifiedAt: new Date().toISOString(),
      price: facts.price,
      currency: facts.currency,
      availability: facts.parsed ? facts.availability : null,
      dateAvailable: facts.dateAvailable,
      cancellation: facts.cancellationTerms,
      operatingHours: facts.operatingHours,
      verdict,
      flags,
      agentNote,
      source: "tavily+llm",
    };

    await store.setAffiliateBookingRequestVerification(requestId, snapshot as unknown as Record<string, unknown>);

    return { available: true, snapshot };
  } finally {
    inFlight.delete(requestId);
  }
}
