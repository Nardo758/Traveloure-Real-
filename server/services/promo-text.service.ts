/**
 * promo-text.service.ts — shared server-side home for distribution captions (Phase A3,
 * mockup v9: "caption AI server-side in the shared promo-text service").
 *
 * Pure-ish: builds a caption from REAL fields only (§13 — never fabricates ratings, reviews,
 * urgency, or facts not passed in). Two tiers:
 *   - buildDeterministicCaption: a template, always available, no network call.
 *   - generatePromoText: best-effort AI polish (Anthropic), same key-gate posture as
 *     expertise-scoring.service.ts — absent key / any API error / empty-or-unusable output
 *     falls back to the deterministic caption. Never throws, never blocks the caller.
 *
 * Three target kinds, one per distributable surface:
 *   - service: an approved provider_services listing (ports buildOfferingCaption from
 *     client/src/pages/backoffice/share-promote.tsx).
 *   - ready_made: an approved ready_made_trips listing — title/market/durationDays/priceCents
 *     only; no rating/review claim ever (no rating aggregate exists for this product — §13).
 *   - storefront: the earner's own /p/:handle page (ports the share-promote.tsx template).
 *
 * ── THE DIRECT-LINK LINE (docs/DECISIONS.md ruling 69 disposition 2) ─────────────────────────
 * Ruling 61 held the waiver marketing caption ("book through my link — skip the service fee") out
 * of this engine until the D6 attribution pin was green. The pin IS green (ruling 68), and the
 * decision-maker's disposition is **reword now, full claim later**: a NEUTRAL "book direct through
 * my link" line may ship, and the FEE-WAIVER wording stays HELD until the D3 traveler fee is
 * actually billed on the direct path. 1C (disposition 6) does NOT unlock it — repointing the RATE
 * does not start billing the traveler FEE, so "skip the service fee" would still describe a charge
 * no traveler is currently made. **Nothing in this file may say skip / waive / free / no fee about
 * the service fee, and the AI prompt below forbids it explicitly**, because the caption is the one
 * place a model could invent the promise the ruling is holding back.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../infrastructure/logger";

export type PromoTextTarget =
  | { kind: "service"; serviceName: string; city: string | null }
  | { kind: "ready_made"; title: string; market: string; durationDays: number; priceCents: number | null }
  | { kind: "storefront"; handle: string };

export interface PromoTextResult {
  caption: string;
  source: "ai" | "template";
}

/**
 * The NEUTRAL direct-link line (ruling 69 disposition 2). It states WHERE to book and nothing
 * about price: the earner's own short link is a real, verifiable thing, and every share surface
 * that uses these captions routes through `/r/:code` or `/p/:handle` (§16). It deliberately makes
 * no claim about fees, discounts or savings — see the file header for what is still held.
 */
export const DIRECT_LINK_CAPTION_LINE = "Book direct through my link.";

// Instagram caption cap (client/src/pages/expert/content-studio.tsx:113 — instagramCaption zod max).
const CAPTION_MAX = 2200;

function trimCaption(text: string): string {
  const trimmed = (text ?? "").trim();
  return trimmed.length > CAPTION_MAX ? trimmed.slice(0, CAPTION_MAX) : trimmed;
}

function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * The deterministic template caption — always available, built from real fields only.
 */
export function buildDeterministicCaption(target: PromoTextTarget): string {
  switch (target.kind) {
    case "service": {
      // Ported from buildOfferingCaption (share-promote.tsx:93).
      const location = target.city ? ` in ${target.city}` : "";
      return `${target.serviceName}${location} — book it on Traveloure. ${DIRECT_LINK_CAPTION_LINE}`;
    }
    case "ready_made": {
      const base = `『${target.title}』 — a ${target.durationDays}-day ${target.market} trip I built on Traveloure.`;
      const priceLine = target.priceCents != null ? ` From ${formatDollars(target.priceCents)}.` : "";
      return `${base}${priceLine}`;
    }
    case "storefront": {
      // Ported from share-promote.tsx:278.
      return `Check out everything I offer on Traveloure — my storefront is @${target.handle}. ${DIRECT_LINK_CAPTION_LINE}`;
    }
  }
}

function describeTargetForPrompt(target: PromoTextTarget): string {
  switch (target.kind) {
    case "service":
      return (
        `A bookable service listing on Traveloure.\n` +
        `Service name: ${target.serviceName}\n` +
        `City: ${target.city ?? "(not specified)"}`
      );
    case "ready_made":
      return (
        `A pre-made, expert-built multi-day trip ("Ready Made Trip") for sale on Traveloure.\n` +
        `Title: ${target.title}\n` +
        `Market/destination: ${target.market}\n` +
        `Duration: ${target.durationDays} days\n` +
        `Price: ${target.priceCents != null ? formatDollars(target.priceCents) : "(not set)"}`
      );
    case "storefront":
      return (
        `The earner's own storefront page on Traveloure, listing everything they sell.\n` +
        `Handle: @${target.handle}`
      );
  }
}

const MODEL = "claude-sonnet-5";

/**
 * Generate a promo caption. Best-effort AI polish over the deterministic template; any failure
 * (no key, API error, empty/unusable output) falls back to the deterministic caption, never throws.
 */
export async function generatePromoText(target: PromoTextTarget): Promise<PromoTextResult> {
  const deterministic = trimCaption(buildDeterministicCaption(target));

  if (!process.env.ANTHROPIC_API_KEY) {
    return { caption: deterministic, source: "template" };
  }

  const prompt =
    `Write ONE short social media caption to promote the following real Traveloure listing. ` +
    `Use ONLY the facts given below — do not invent facts, do not invent or imply reviews, ratings, ` +
    `testimonials, availability, or urgency ("almost sold out", "limited spots", etc.) that aren't ` +
    `stated here. Keep it concise (1-3 sentences), friendly, and specific to the listing. You may ` +
    `include at most 3 hashtags total, and only if they add value — no hashtag spam. ` +
    // Ruling 69 disposition 2: the model must not invent the promise the ruling is holding back.
    `NEVER claim or imply any discount, saving, waived fee, "no service fee", "skip the fee", ` +
    `cheaper price, or any other pricing benefit for booking through this link — no such benefit ` +
    `is being offered to the traveler and stating one would be false. You MAY invite people to ` +
    `book directly through the link. Return ONLY the ` +
    `caption text, no quotes, no preamble, no explanation.\n\n` +
    `${describeTargetForPrompt(target)}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim()
      // Strip a wrapping pair of straight/curly quotes some models add despite instruction.
      .replace(/^["“]([\s\S]*)["”]$/, "$1")
      .trim();
    if (!text) {
      return { caption: deterministic, source: "template" };
    }
    return { caption: trimCaption(text), source: "ai" };
  } catch (err: any) {
    logger.error(`[promo-text] generation failed: ${err?.message ?? "unknown"}`);
    return { caption: deterministic, source: "template" };
  }
}
