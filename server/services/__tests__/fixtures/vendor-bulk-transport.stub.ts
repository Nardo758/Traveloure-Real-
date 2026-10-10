import { vi } from "vitest";

// Physical test module: no SDK import, secrets lookup, flags or network fallback.
export const sendEmail = vi.fn(async (_params: {
  to: string | string[]; subject: string; html: string; idempotencyKey?: string;
  attachments?: unknown[];
}): Promise<{ ok: boolean; id?: string; error?: string }> => {
  throw new Error("Synthetic transport must be configured by the test");
});
