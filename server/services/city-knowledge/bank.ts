/**
 * The city-knowledge bank. The answer key stays in a data file (or an admin-saved copy).
 * The client never imports this module.
 *
 * Sign-off is a hash on city_knowledge_banks. The file's own verificationStatus stays
 * unverified until Leon signs off, and a sign-off that does not match the current
 * canonical bank does not authorize approval.
 */
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { CITY_KNOWLEDGE_TOPICS, canonicalJson, type TimingFact } from "@shared/city-knowledge";
import { db } from "../../db";
import { cityKnowledgeBanks } from "@shared/schema";

const sourceSchema = z.object({ url: z.string(), checkedOn: z.string() });

const itemSchema = z.object({
  id: z.string().min(1),
  topic: z.enum(CITY_KNOWLEDGE_TOPICS),
  type: z.enum(["mc", "sa"]),
  select: z.enum(["one", "all"]),
  status: z.enum(["active", "inactive"]),
  factCheck: z.enum(["ok", "unverified"]),
  expiresAfter: z.string().nullable().optional(),
  inactiveReason: z.string().optional(),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  acceptAllOf: z.array(z.array(z.string())).optional(),
  answerText: z.string(),
  sources: z.array(sourceSchema),
});

const claimSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "inactive"]),
  factCheck: z.enum(["ok", "unverified"]),
  text: z.string(),
});

const windowSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  weekdays: z.enum(["weekday", "weekend", "any"]).optional(),
  lastEntry: z.string(),
});

const timingSchema = z.object({
  id: z.string(),
  match: z.array(z.string()),
  factCheck: z.enum(["ok", "unverified"]),
  status: z.enum(["active", "inactive"]),
  alwaysOpen: z.boolean().optional(),
  closedDates: z.array(z.string()).optional(),
  closedMonthDays: z.array(z.string()).optional(),
  windows: z.array(windowSchema).optional(),
  fixedReservation: z.boolean().optional(),
});

export const cityKnowledgeBankSchema = z.object({
  cityKey: z.string().regex(/^[a-z0-9-]+$/),
  cityName: z.string().min(1),
  timeZone: z.string().min(1),
  verificationStatus: z.string(),
  factCheckedOn: z.string().optional(),
  note: z.string().optional(),
  zones: z.array(z.object({ zone: z.string(), match: z.array(z.string()) })),
  timingFacts: z.array(timingSchema),
  items: z.array(itemSchema).min(1),
  briefs: z.array(z.object({
    id: z.enum(["b1", "b2"]),
    weight: z.number(),
    title: z.string(),
    prompt: z.string(),
    gemMinimum: z.number().optional(),
    scoringClaims: z.array(claimSchema),
  })),
});

export type CityKnowledgeBank = z.infer<typeof cityKnowledgeBankSchema>;
export type CityKnowledgeItem = CityKnowledgeBank["items"][number];

const DATA_DIR = path.join(process.cwd(), "data", "city-knowledge");

export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function readBankFile(cityKey: string): CityKnowledgeBank {
  if (!/^[a-z0-9-]+$/.test(cityKey)) throw new Error("Unknown city-knowledge bank");
  const file = path.join(DATA_DIR, `${cityKey}.json`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return cityKnowledgeBankSchema.parse(raw);
}

export function publishedCityKeysFromFiles(): string[] {
  try {
    return readdirSync(DATA_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .filter((key) => /^[a-z0-9-]+$/.test(key))
      .sort();
  } catch {
    return [];
  }
}

export interface LoadedBank {
  bank: CityKnowledgeBank;
  contentHash: string;
  signedOff: boolean;
  source: "file" | "saved";
}

export async function loadCityKnowledgeBank(cityKey: string): Promise<LoadedBank | null> {
  const [row] = await db
    .select()
    .from(cityKnowledgeBanks)
    .where(eq(cityKnowledgeBanks.cityKey, cityKey))
    .limit(1);
  let bank: CityKnowledgeBank;
  let source: "file" | "saved" = "file";
  if (row?.bankJson) {
    const parsed = cityKnowledgeBankSchema.safeParse(row.bankJson);
    if (!parsed.success) return null;
    bank = parsed.data;
    source = "saved";
  } else if (publishedCityKeysFromFiles().includes(cityKey)) {
    bank = readBankFile(cityKey);
  } else {
    return null;
  }
  const contentHash = hashCanonical(bank);
  const signedOff = row?.verificationStatus === "signed_off" && row.signedOffHash === contentHash;
  return { bank, contentHash, signedOff, source };
}

export async function publishedCityKeys(): Promise<string[]> {
  const files = publishedCityKeysFromFiles();
  const rows = await db.select({ cityKey: cityKnowledgeBanks.cityKey, bankJson: cityKnowledgeBanks.bankJson }).from(cityKnowledgeBanks);
  const keys = new Set(files);
  for (const row of rows) {
    if (row.bankJson) keys.add(row.cityKey);
  }
  return Array.from(keys).sort();
}

export function publicItem(item: CityKnowledgeItem, optionOrder: string[] | null) {
  const options = item.options ? [...item.options] : [];
  if (optionOrder && options.length > 0) {
    const rank = new Map(optionOrder.map((id, i) => [id, i]));
    options.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }
  return {
    id: item.id,
    topic: item.topic,
    type: item.type,
    select: item.select,
    prompt: item.prompt,
    options: options.map((option) => ({ id: option.id, text: option.text })),
  };
}

export function activeTimingFacts(bank: CityKnowledgeBank): TimingFact[] {
  return bank.timingFacts.filter((fact) => fact.status === "active" && fact.factCheck === "ok");
}

export function activeClaims(brief: CityKnowledgeBank["briefs"][number]) {
  return brief.scoringClaims.filter((claim) => claim.status === "active" && claim.factCheck === "ok");
}
