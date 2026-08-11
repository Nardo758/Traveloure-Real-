/**
 * object-storage.ts
 *
 * Thin wrapper around @replit/object-storage.  A single Client instance is
 * created lazily on first use, scoped to the bucket Replit injects via
 * REPLIT_OBJECT_STORAGE_BUCKET.
 *
 * When a bucket is attached in the Replit App Storage panel that env var is
 * set automatically and the server needs a restart to pick it up.  Until then,
 * every call throws a clear, actionable error rather than a cryptic SDK error.
 *
 * Public API:
 *   uploadBuffer(path, buffer)     → public HTTPS URL
 *   deleteObject(path)             → void (idempotent)
 *   objectPublicUrl(path)          → public HTTPS URL (no network call)
 */

import { Client } from "@replit/object-storage";

let _client: Client | null = null;

function getClient(): Client {
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
  const client = getClient();
  const { ok, error } = await client.uploadFromBytes(path, data);
  if (!ok) {
    throw new Error(
      `[object-storage] Upload failed for "${path}": ${error?.message ?? String(error)}`
    );
  }
  return objectPublicUrl(path);
}

/**
 * Delete an object by its storage path.  Silently succeeds if the object
 * does not exist.
 */
export async function deleteObject(path: string): Promise<void> {
  const client = getClient();
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
