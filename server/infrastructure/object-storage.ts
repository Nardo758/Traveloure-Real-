/**
 * object-storage.ts
 *
 * Thin wrapper around @replit/object-storage.  A single Client instance is
 * created lazily on first use, scoped to the bucket Replit injects via
 * REPLIT_OBJECT_STORAGE_BUCKET.
 *
 * When a bucket is attached in the Replit App Storage panel that env var is
 * set automatically and the server needs a restart to pick it up.  Until then,
 * every call throws a clear, actionable error rather than a cryptic SDK error
 * — never a crash, never a fabricated success.
 *
 * PRIVACY FINDING (R4, docs/DECISIONS.md ruling 58): this bucket has no
 * `publicPaths` grant anywhere in `.replit` or the codebase, and the client
 * authenticates to GCS via Replit's sidecar-issued credentials (ADC), the
 * standard PRIVATE-bucket posture for Replit App Storage — a bare
 * unauthenticated GET against `objectPublicUrl()`'s URL returns 403.
 * EMPIRICALLY VERIFIED PRIVATE (Aug 11, 2026): a live unauthenticated GET
 * against the raw GCS URL (https://storage.googleapis.com/<bucket>/<key>)
 * for a freshly uploaded deliverable returned HTTP 403 Forbidden — ruling 58
 * bucket-privacy question CLOSED. Storage keys still embed a crypto-random
 * component as defense-in-depth (see `deliverableStorageKey` at the R4 call
 * site), but the bucket's own ACL is now the primary privacy guarantee.
 * `objectPublicUrl()` is never called, returned, or otherwise disclosed on
 * the deliverable rail — only the KEY is persisted, and only `downloadBytes`
 * (an authenticated call) ever reads the bytes back.
 *
 * TEST DRIVER: when `OBJECT_STORAGE_DRIVER=memory` and `NODE_ENV !==
 * "production"`, every function below operates against an in-process
 * `Map<string, Buffer>` instead of the real GCS-backed client — this is how
 * `server/__tests__/deliverable-protected-rail.http.test.ts` exercises the
 * managed (`objstore:`) upload → download → stream path with no live Replit
 * credentials. It is opt-in and production-fenced by construction: setting
 * the env var alone in a production process is not enough to activate it.
 * The real `@replit/object-storage` package is imported LAZILY (dynamic
 * `import()` inside `getClient()`, never a top-level import) specifically so
 * the memory driver works even in an environment where that package isn't
 * installed at all (this container's dev sandbox has no network path to pull
 * it — see the R4 ledger entry) — module resolution of the real SDK is only
 * ever attempted on the non-memory-driver path.
 *
 * Public API:
 *   uploadBuffer(path, buffer)     → public HTTPS URL (legacy shape; the
 *                                     deliverable rail never persists or
 *                                     transmits this return value — see the
 *                                     privacy finding above)
 *   downloadBytes(path)            → Buffer (the deliverable rail's only read)
 *   deleteObject(path)             → void (idempotent)
 *   objectPublicUrl(path)          → public HTTPS URL (no network call)
 */

import type { Client as ObjectStorageClient } from "@replit/object-storage";

let _client: ObjectStorageClient | null = null;

function useMemoryDriver(): boolean {
  return process.env.OBJECT_STORAGE_DRIVER === "memory" && process.env.NODE_ENV !== "production";
}

// In-process fake store for the test driver only. Never consulted unless
// useMemoryDriver() is true.
const _memoryStore = new Map<string, Buffer>();

async function getClient(): Promise<ObjectStorageClient> {
  const bucketId = process.env.REPLIT_OBJECT_STORAGE_BUCKET;
  if (!bucketId) {
    throw new Error(
      "[object-storage] REPLIT_OBJECT_STORAGE_BUCKET is not set. " +
        "Create a bucket in the Replit App Storage panel and restart the server."
    );
  }
  // Re-create if the bucket id ever changes (e.g. a fresh dev restart with a
  // different bucket); in practice it's stable for the lifetime of a process.
  if (!_client) {
    const { Client } = await import("@replit/object-storage");
    _client = new Client({ bucketId });
  }
  return _client;
}

/**
 * Upload a Buffer to the bucket and return its public HTTPS URL.
 *
 * @param path - Storage key, e.g. "vendor-documents/123/contract.pdf"
 * @param data - File contents as a Node.js Buffer
 */
export async function uploadBuffer(path: string, data: Buffer): Promise<string> {
  if (useMemoryDriver()) {
    _memoryStore.set(path, data);
    // Deliberately NOT a real https:// URL — a memory:// marker so a caller
    // that (mis)treats this as fetchable fails loudly in tests rather than
    // silently "succeeding" against nothing.
    return `memory://${path}`;
  }
  const client = await getClient();
  const { ok, error } = await client.uploadFromBytes(path, data);
  if (!ok) {
    throw new Error(
      `[object-storage] Upload failed for "${path}": ${error?.message ?? String(error)}`
    );
  }
  return objectPublicUrl(path);
}

/**
 * Download an object as a Buffer of its raw bytes. Throws a clear error
 * (never a fabricated empty result) if the bucket is not configured, the
 * object does not exist, or the download otherwise fails.
 *
 * @param path - Storage key to fetch.
 */
export async function downloadBytes(path: string): Promise<Buffer> {
  if (useMemoryDriver()) {
    const buf = _memoryStore.get(path);
    if (!buf) {
      throw new Error(`[object-storage] Object not found: "${path}"`);
    }
    return buf;
  }
  const client = await getClient();
  const { ok, value, error } = await client.downloadAsBytes(path);
  if (!ok) {
    throw new Error(
      `[object-storage] Download failed for "${path}": ${error?.message ?? String(error)}`
    );
  }
  return value[0];
}

/**
 * Delete an object by its storage path.  Silently succeeds if the object
 * does not exist.
 */
export async function deleteObject(path: string): Promise<void> {
  if (useMemoryDriver()) {
    _memoryStore.delete(path);
    return;
  }
  const client = await getClient();
  const { ok, error } = await client.delete(path, { ignoreNotFound: true });
  if (!ok) {
    console.warn(
      `[object-storage] Delete warning for "${path}": ${error?.message ?? String(error)}`
    );
  }
}

/**
 * Return the public HTTPS URL for a stored object without making a network
 * call.  Replit App Storage objects are served via Google Cloud Storage.
 *
 * R4 note: this URL's actual public reachability is UNVERIFIED (see the
 * privacy finding in the file header) — treat it as sensitive. The
 * deliverable rail never calls this function.
 */
export function objectPublicUrl(path: string): string {
  const bucketId = process.env.REPLIT_OBJECT_STORAGE_BUCKET;
  if (!bucketId) {
    throw new Error(
      "[object-storage] REPLIT_OBJECT_STORAGE_BUCKET is not set — cannot derive public URL."
    );
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://storage.googleapis.com/${bucketId}/${encodedPath}`;
}
