// Item 2 Phase 1 (ledger 2026-08-23-item2-grounding): the PURE name matcher for slip-grounding.
//
// Split out from slip-grounding.service.ts so it can be unit-tested with no DB import (the service
// transitively imports ../db, which throws without DATABASE_URL). This file has ZERO imports — it is
// a deterministic string matcher, nothing else. The service imports similarity/MATCH_THRESHOLD from
// here; the test imports them from here too.

// Conservative threshold (Q4). A normalized exact/contains name hit scores 1.0; a strong token
// overlap can clear the bar; weak overlap never does. Fail-closed: below this, no link.
export const MATCH_THRESHOLD = 0.82;

/** lower(trim(collapse-ws)), strip a few generic itinerary words so "Morning temple visit" can meet
 *  "Kiyomizu-dera Temple" on the shared token. Same normalize spirit as dmo normalizedName. */
function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s]/g, " ")
    .replace(/\b(the|a|an|visit|to|of|in|at|tour|experience|morning|afternoon|evening|day|trip)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): string[] {
  const seen: Record<string, true> = {};
  const out: string[] = [];
  for (const t of normalize(s).split(" ")) {
    if (t.length >= 3 && !seen[t]) { seen[t] = true; out.push(t); }
  }
  return out;
}

/** 0..1 similarity, deterministic, no external calls — a matcher, not a geocoder.
 *  Confidence requires ≥2 significant tokens: full-name containment of a multi-token name scores
 *  1.0, otherwise Jaccard over ≥3-char tokens. A single shared generic word ("temple", "lunch") is
 *  NEVER an identity — one common noun must not ground an item (§13 fail-closed), so both an
 *  exact-equal single token and a lone-token overlap return 0. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Full-name containment of a multi-token name (covers exact-equality) is a confident hit. The
  // ≥2-token gate on the CONTAINED name is what stops "temple" ⊂ "Kiyomizu-dera Temple" from
  // grounding a vague item on a single common word.
  if (na === nb && ta.length >= 2) return 1;
  if (nb.includes(na) && ta.length >= 2) return 1;
  if (na.includes(nb) && tb.length >= 2) return 1;

  // Otherwise Jaccard over ≥3-char tokens — but a single shared token carries no identity, so
  // fewer than two shared significant tokens is never a match.
  const bset: Record<string, true> = {};
  for (const t of tb) bset[t] = true;
  let inter = 0;
  for (const t of ta) if (bset[t]) inter++;
  if (inter < 2) return 0;
  return inter / (ta.length + tb.length - inter);
}
