/**
 * text-sanitizer.ts — shared server-side sanitizer for user-authored free text.
 *
 * Defense-in-depth (task: harden provider text fields against script injection):
 * React auto-escapes on render, but stored raw payloads (`<img src=x onerror=…>`)
 * are a latent stored-XSS risk for every NON-React consumer — transactional
 * emails, PDF generation, CSV/API exports, admin tools that render HTML.
 * So provider-entered free text is sanitized ON WRITE with the same pattern the
 * expert profile route already uses (strip tags, then entity-encode the
 * dangerous characters). Plain prose passes through unchanged apart from
 * `<>'"` encoding; there is no legitimate reason for HTML in these fields.
 *
 * This module is the ONE home for that logic — routes.ts's original local
 * `sanitizeInput`/`sanitizeObject` now delegate here so the pattern can't drift.
 */

/** Strip HTML tags and entity-encode dangerous characters. Non-strings pass through. */
export function sanitizeText<T>(input: T): T {
  if (typeof input !== "string") return input;
  return (input as string)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "") // drop script/style INCLUDING their content
    .replace(/<[^>]*>/g, "") // remove remaining HTML tags
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = {
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      };
      return entities[char] || char;
    })
    .trim() as unknown as T;
}

/** Sanitize every top-level string field of an object (shallow). */
export function sanitizeObjectStrings<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === "string") {
      (result as Record<string, any>)[key] = sanitizeText(result[key]);
    }
  }
  return result;
}

/**
 * Sanitize ONLY the named free-text fields of an object, in place on a shallow
 * copy. Handles string values and arrays of strings; null/undefined and
 * non-string values are left untouched. Use this on allow-listed write payloads
 * where only specific fields are prose (ids/enums/urls must not be mangled).
 */
/**
 * Recursively sanitize every string inside a value — handles plain strings,
 * arrays (e.g. whatIncluded/requirements string arrays), and objects
 * (e.g. faqs [{question, answer}], pricingTiers [{label, price, unit, description}]).
 * Non-string leaves (numbers, booleans, null) pass through untouched.
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) out[k] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}

/**
 * Every user-authored prose field accepted on provider_services writes — including the
 * structured JSON prose (whatIncluded/requirements string arrays, faqs question/answer
 * objects, pricingTiers label/unit/description). Deliberately EXCLUDES ids, enums, URLs,
 * times, and numeric/config fields, which must not be mangled.
 */
export const PROVIDER_SERVICE_TEXT_FIELDS = [
  "serviceName",
  "shortDescription",
  "description",
  "priceBasedOn",
  "deliveryTimeframe",
  "location",
  "meetingPoint",
  "pickupAddress",
  "dropOffPoint",
  "cancellationPolicy",
  "whatIncluded",
  "requirements",
  "faqs",
  "pricingTiers",
] as const;

/**
 * Sanitize a raw provider-service write body BEFORE zod validation, so length/min
 * constraints are enforced against the value that is actually stored (entity encoding
 * can grow a string past a varchar limit; tag stripping can empty a required field).
 */
export function sanitizeProviderServiceBody<T extends Record<string, any>>(body: T): T {
  const result = { ...body };
  for (const key of PROVIDER_SERVICE_TEXT_FIELDS) {
    if (key in result) (result as Record<string, any>)[key] = sanitizeDeep(result[key]);
  }
  return result;
}

export function sanitizeTextFields<T extends Record<string, any>>(
  obj: T,
  fields: readonly (keyof T & string)[],
): T {
  const result = { ...obj };
  for (const key of fields) {
    const v = result[key];
    if (typeof v === "string") {
      (result as Record<string, any>)[key] = sanitizeText(v);
    } else if (Array.isArray(v)) {
      (result as Record<string, any>)[key] = v.map((item: unknown) =>
        typeof item === "string" ? sanitizeText(item) : item,
      );
    }
  }
  return result;
}
