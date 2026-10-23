/**
 * `boot_seed_stamps` read and write (ledger `2026-10-22-boot-seed-stamps`, migration 406).
 * Server-only. A missing table is "no stamp": the caller seeds and does not write.
 */
import { db } from "../../db";
import { bootSeedStamps } from "@shared/schema";
import { isUndefinedTableError, type StampRead } from "./boot-seed-stamp";

export async function readBootSeedStamps(): Promise<StampRead> {
  try {
    const rows = await db
      .select({ stampKey: bootSeedStamps.stampKey, inputHash: bootSeedStamps.inputHash })
      .from(bootSeedStamps);
    return {
      available: true,
      stamps: new Map(rows.map((row) => [row.stampKey, row.inputHash])),
    };
  } catch (err) {
    if (isUndefinedTableError(err)) return { available: false, stamps: new Map() };
    throw err;
  }
}

export async function writeBootSeedStamp(key: string, inputHash: string): Promise<void> {
  const appliedAt = new Date();
  await db
    .insert(bootSeedStamps)
    .values({ stampKey: key, inputHash, appliedAt })
    .onConflictDoUpdate({
      target: bootSeedStamps.stampKey,
      set: { inputHash, appliedAt },
    });
}
