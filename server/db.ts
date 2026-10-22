import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { backgroundPoolConfig, requestPoolConfig } from "./db-pool-config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = process.env.DATABASE_URL;

function attachPoolLogging(pool: pg.Pool, label: string): void {
  pool.on("error", (err) => {
    console.error(`Unexpected ${label} database pool error:`, err);
    console.error(`${label} database pool state at error:`, {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    });
  });

  pool.on("connect", () => {
    console.log(`New ${label} database connection established`);
  });
}

/** Request path. Sweeps do not check clients out of this pool. */
export const pool = new Pool(requestPoolConfig(databaseUrl));
attachPoolLogging(pool, "request");

/**
 * Sweeps only. Small on purpose: a Neon wake-up must not occupy the request
 * pool's slots while `connectionTimeoutMillis` is still running.
 */
export const backgroundPool = new Pool(backgroundPoolConfig(databaseUrl));
attachPoolLogging(backgroundPool, "background");

export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export const db = drizzle(pool, { schema });
export const backgroundDb = drizzle(backgroundPool, { schema });
