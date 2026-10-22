/**
 * node-postgres pool settings for Neon serverless (compute suspend / wake-up).
 *
 * A cold compute often takes longer than 5s to accept a TCP+auth handshake. pg-pool
 * turns that into `Error: timeout exceeded when trying to connect` once
 * `connectionTimeoutMillis` elapses — the same string production logged on
 * 2026-10-21. 15s covers a wake-up without waiting forever.
 *
 * Idle clients are closed before Neon's proxy drops the socket, so the next
 * checkout opens a fresh connection instead of writing on a dead one. TCP
 * keepalive is what notices a socket Neon already closed.
 *
 * Three pools, on purpose: request traffic, a small background pool for sweeps,
 * and the session store. They do not share a 20-slot queue, so a sweep waiting
 * on a wake-up cannot fill the request pool.
 */
export const REQUEST_POOL_MAX = 10;
export const BACKGROUND_POOL_MAX = 2;
export const SESSION_POOL_MAX = 2;

/** Longer than a Neon cold start; shorter than an operator would wait on a dead host. */
export const POOL_CONNECTION_TIMEOUT_MS = 15_000;
/** Recycle before Neon's proxy idle-close (the socket would otherwise fail the next query). */
export const POOL_IDLE_TIMEOUT_MS = 20_000;
export const POOL_KEEPALIVE_INITIAL_DELAY_MS = 10_000;

export interface NeonPoolOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  keepAlive: true;
  keepAliveInitialDelayMillis: number;
  allowExitOnIdle: false;
}

function neonPoolOptions(connectionString: string, max: number): NeonPoolOptions {
  return {
    connectionString,
    max,
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: POOL_KEEPALIVE_INITIAL_DELAY_MS,
    allowExitOnIdle: false,
  };
}

export function requestPoolConfig(connectionString: string): NeonPoolOptions {
  return neonPoolOptions(connectionString, REQUEST_POOL_MAX);
}

export function backgroundPoolConfig(connectionString: string): NeonPoolOptions {
  return neonPoolOptions(connectionString, BACKGROUND_POOL_MAX);
}

export function sessionPoolConfig(connectionString: string): NeonPoolOptions {
  return neonPoolOptions(connectionString, SESSION_POOL_MAX);
}
