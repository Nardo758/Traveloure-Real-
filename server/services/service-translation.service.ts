// Ruling 60 Phase B — provider CONTENT translation, AI-draft generator.
// docs/DECISIONS.md ruling 60 / ruling 73; QA_PUNCH_LIST I18N-4.
//
// This is the OPT-IN machine first-draft path. A provider asks for a draft translation of their
// OWN listing into a target locale; the result is stored labeled `source='ai_draft', status='draft'`
// and is NEVER shown to a traveler until the provider reviews and approves it (§13 applied to
// language — an AI draft is ALWAYS labeled, and never auto-publishes).
//
// Uses the EXISTING AI infrastructure (@anthropic-ai/sdk + ai-cost-tracker), mirroring
// server/services/dmo-place-extraction.service.ts — the same key check, the same cost-tracked
// call, the same TAGGED-OUTCOME contract (never throws for the expected failure modes). NO new AI
// client, NO new cost table.
//
// BENCH REALITY: there is no live ANTHROPIC_API_KEY on the bench. When the key is unset this
// returns { status: "no_api_key" } and the route degrades honestly (503, a clear "AI draft
// unavailable" state) — it NEVER fabricates or echoes a translation (§13). The draft LIFECYCLE
// (stored labeled → hidden from travelers → provider approval flips it to approved) is proven
// without a live LLM in server/__tests__/service-content-translation.http.test.ts.

import Anthropic from "@anthropic-ai/sdk";
import { trackAICost, calculateAnthropicCost } from "./ai-cost-tracker";

// The content locales this system ships (ruling 60 launch market = Kyoto → en + ja). Deliberately
// the SHIPPED set, NOT the wider settings enum (en, ja, es, fr, de): drafting into an unshipped
// locale would mint content nobody can review or render. Ruling 115: the source language is no
// longer assumed to be English — it is the listing's own `source_locale` (NULL = en, the pre-216
// assumption made explicit), and the listing's source locale is never a translation TARGET.
export const CONTENT_LOCALES = ["en", "ja"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export function isContentLocale(v: unknown): v is ContentLocale {
  return typeof v === "string" && (CONTENT_LOCALES as readonly string[]).includes(v);
}

// Human-readable language names for the prompt (source and target both come from here).
const LOCALE_LANGUAGE_NAME: Record<string, string> = {
  ja: "Japanese (日本語, polite です/ます register)",
  en: "English",
};

// Ruling 115: the effective source language of a listing. NULL/undefined/unknown = 'en' —
// every pre-216 row was authored under ruling 60's source-is-English assumption, so this
// default is a recorded fact, not a guess.
export function effectiveSourceLocale(raw: unknown): ContentLocale {
  return isContentLocale(raw) ? raw : "en";
}

// The translatable free-text fields (ruling 60: "listing names/descriptions/meeting-point text").
export interface TranslatableContent {
  serviceName: string | null;
  shortDescription: string | null;
  description: string | null;
  meetingPoint: string | null;
}

export type TranslationDraftOutcome =
  // ANTHROPIC_API_KEY is unset — nothing attempted, nothing fabricated (§13).
  | { status: "no_api_key" }
  // The target locale is the listing's own source language or not a shipped content locale — a
  // draft would be meaningless. Refused, never guessed.
  | { status: "unsupported_locale" }
  // The AI call failed (network/parse) — nothing drafted, safe to retry.
  | { status: "ai_error" }
  // A real draft ran to completion — machine-generated content, to be stored labeled ai_draft.
  | { status: "drafted"; content: TranslatableContent };

const DRAFT_SYSTEM_PROMPT = `You are a professional localization translator for a travel-services marketplace.
You translate a service provider's OWN listing content from the stated source language into the requested target language.
Rules:
- Translate ONLY the provided field values. Do not add, remove, or invent content.
- Preserve meaning, tone and any place names; keep proper nouns recognizable.
- A null field stays null in the output.
- Return ONLY a JSON object with exactly these keys: serviceName, shortDescription, description, meetingPoint.
- Each value is the translated string, or null if the input was null.`;

function buildUserPrompt(content: TranslatableContent, targetLocale: string, sourceLocale: string): string {
  const langName = LOCALE_LANGUAGE_NAME[targetLocale] ?? targetLocale;
  const sourceName = LOCALE_LANGUAGE_NAME[sourceLocale] ?? sourceLocale;
  return `Source language: ${sourceName}\nTarget language: ${langName}\n\nSource fields (JSON):\n${JSON.stringify(
    {
      serviceName: content.serviceName,
      shortDescription: content.shortDescription,
      description: content.description,
      meetingPoint: content.meetingPoint,
    },
    null,
    2,
  )}\n\nReturn ONLY the translated JSON object.`;
}

function parseDraftJson(raw: string): TranslatableContent | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const field = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v : null;
    return {
      serviceName: field(obj.serviceName),
      shortDescription: field(obj.shortDescription),
      description: field(obj.description),
      meetingPoint: field(obj.meetingPoint),
    };
  } catch {
    return null;
  }
}

/**
 * Generate a machine first-draft translation of a listing's content into `targetLocale`.
 * Never throws for the expected failure modes (no key, unsupported locale, AI error) — those are
 * tagged outcomes the route maps to an honest HTTP state. Only an unexpected programmer error
 * rejects the promise.
 */
export async function draftServiceTranslation(
  original: TranslatableContent,
  targetLocale: string,
  actorId: string | null,
  // Ruling 115: the listing's own source language. Defaults to 'en' (the pre-216 posture) so
  // every existing caller keeps its exact behavior.
  sourceLocale: ContentLocale = "en",
): Promise<TranslationDraftOutcome> {
  if (!isContentLocale(targetLocale) || targetLocale === sourceLocale) {
    return { status: "unsupported_locale" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: "no_api_key" };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(original, targetLocale, sourceLocale) }],
    });
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    if (inputTokens > 0 || outputTokens > 0) {
      trackAICost({
        sourceType: "service_content_translation",
        modelUsed: "claude-sonnet-4-5",
        userId: actorId,
        requestId: `locale:${targetLocale}`,
        costUsd: calculateAnthropicCost(inputTokens, outputTokens),
        tokensIn: inputTokens,
        tokensOut: outputTokens,
      }).catch((err) => console.error("[cost-tracker] service_content_translation:", err));
    }
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = raw ? parseDraftJson(raw) : null;
    if (parsed === null) return { status: "ai_error" };
    return { status: "drafted", content: parsed };
  } catch (err) {
    console.error("[service-translation] AI draft failed:", err);
    return { status: "ai_error" };
  }
}
