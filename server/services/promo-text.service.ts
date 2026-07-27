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
      return `${target.serviceName}${location} — book it on Traveloure.`;
    }
    case "ready_made": {
      const base = `『${target.title}』 — a ${target.durationDays}-day ${target.market} trip I built on Traveloure.`;
      const priceLine = target.priceCents != null ? ` From ${formatDollars(target.priceCents)}.` : "";
      return `${base}${priceLine}`;
    }
    case "storefront": {
      // Ported from share-promote.tsx:278.
      return `Check out everything I offer on Traveloure — my storefront is @${target.handle}.`;
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
    `include at most 3 hashtags total, and only if they add value — no hashtag spam. Return ONLY the ` +
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
