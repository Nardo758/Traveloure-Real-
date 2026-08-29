import { z } from "zod";

const overrideSchema = z.object({
  developmentVerificationOverrideReason: z.string().trim().min(1).max(1000),
}).strict();

export type DevelopmentVerificationOverride =
  | { requested: false }
  | { requested: true; ok: true; reason: string }
  | { requested: true; ok: false; status: 400 | 403; message: string };

/**
 * Development-only escape hatch for exercising the real listing approval queue when
 * external identity/KYB providers cannot complete seeded personas. Absence is the normal
 * production path; presence outside development is always rejected.
 */
export function resolveDevelopmentVerificationOverride(
  body: unknown,
  nodeEnv = process.env.NODE_ENV,
): DevelopmentVerificationOverride {
  const raw = body && typeof body === "object"
    ? (body as Record<string, unknown>).developmentVerificationOverrideReason
    : undefined;
  if (raw === undefined) return { requested: false };
  if (nodeEnv !== "development") {
    return {
      requested: true,
      ok: false,
      status: 403,
      message: "Development verification overrides are disabled in this environment",
    };
  }
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return {
      requested: true,
      ok: false,
      status: 400,
      message: "A development verification override reason is required",
    };
  }
  return { requested: true, ok: true, reason: parsed.data.developmentVerificationOverrideReason };
}