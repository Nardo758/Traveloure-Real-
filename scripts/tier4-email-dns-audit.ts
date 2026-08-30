/**
 * Tier 4 — Email Authentication Audit Script  (v2)
 *
 * Read-only. Safe to run without side-effects.
 *
 * What it does:
 *   1. Reads RESEND_API_KEY (presence only logged; key never printed).
 *   2. Derives the sender domain from EMAIL_FROM_NOREPLY / EMAIL_FROM
 *      (local-part and full address never printed).
 *   3. Lists Resend domain inventory:
 *        • If a senderDomain is known, matches it exactly — provider evidence
 *          stays null and a limitation is recorded when there is no match.
 *          There is NO fallback to an unrelated first domain in this case.
 *        • If no senderDomain is configured, falls back to the first domain in
 *          the inventory and marks the evidence with fallbackUsed:true.
 *      Fetches the full matched domain record (status, region, ALL SPF records,
 *      DKIM record metadata).
 *   4. Queries live DNS (node:dns/promises) for:
 *        • SPF       – TXT records at the sender apex domain
 *        • DMARC     – TXT records at _dmarc.<domain>
 *        • DKIM      – per selector provided by Resend (CNAME or TXT)
 *        • providerSpf – for every provider-supplied SPF record, queries the
 *                        actual record name under the sender domain (TXT or MX)
 *   5. Writes deterministic JSON to docs/audits/tier4-evidence/email-auth.json.
 *   6. Never sends email; never calls retry/send endpoints.
 *
 * Exit codes:
 *   0 – audit completed (missing evidence captured in JSON, not a hard error)
 *   1 – script/program error (unhandled exception)
 *
 * Usage:
 *   npx tsx scripts/tier4-email-dns-audit.ts
 */

import { Resend } from "resend";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────────

interface DkimEvidence {
  selector: string;
  providerRecordName: string;
  providerRecordType: string;
  providerRecordStatus: string;
  dnsLookupName: string;
  dnsResult:
    | {
        found: true;
        type: string;
        valuePresent: boolean;
        valueLength: number | null;
        valueSha256: string | null;
        valuePrefix: string | null;
        // rawValues intentionally omitted for TXT (public key)
        // CNAME target (a public hostname) stored separately
        cnameTarget?: string;
      }
    | { found: false; error: string };
}

/** Concise result for one provider-supplied SPF record queried against live DNS. */
interface ProviderSpfDnsEvidence {
  /** Record name as supplied by Resend, e.g. "send" */
  providerRecordName: string;
  /** Record type as supplied by Resend ("MX" | "TXT") */
  providerRecordType: string;
  /** Resend-reported status for this record */
  providerRecordStatus: string;
  /** Resend-supplied expected value (public; short hostname / include string) */
  providerRecordValue: string;
  /** Actual DNS name queried: "<name>.<senderDomain>" */
  dnsLookupName: string;
  dnsResult:
    | { found: true; type: "TXT"; records: string[] }
    | {
        found: true;
        type: "MX";
        exchanges: Array<{ priority: number; exchange: string }>;
      }
    | { found: false; error: string };
}

interface ProviderDomainEvidence {
  domainId: string;
  domainName: string;
  /** When true, no senderDomain was configured; first inventory entry was used. */
  fallbackUsed: boolean;
  status: string;
  region: string;
  capabilities: Record<string, string>;
  openTracking: boolean | undefined;
  clickTracking: boolean | undefined;
  /** All SPF records reported by Resend for this domain (was a single find() before v2). */
  spfRecords: Array<{
    name: string;
    type: string;
    status: string;
    value: string;
  }>;
  /** DKIM record metadata only — full public key deliberately omitted; summarised in liveDns.dkim. */
  dkimRecords: Array<{
    name: string;
    type: string;
    status: string;
  }>;
}

interface SpfEvidence {
  queryName: string;
  found: boolean;
  records: string[];
  spfPolicies: string[];
  error?: string;
}

interface DmarcEvidence {
  queryName: string;
  found: boolean;
  records: string[];
  dmarcPolicy: string | null;
  error?: string;
}

interface AuditReport {
  auditVersion: "tier4-email-auth-v2";
  generatedAtUtc: string;
  secrets: {
    RESEND_API_KEY_present: boolean;
    EMAIL_FROM_NOREPLY_present: boolean;
    EMAIL_FROM_present: boolean;
    TIER4_AUTHORIZED_TEST_EMAIL_present: boolean;
  };
  senderDomain: string | null;
  provider: ProviderDomainEvidence | null;
  providerErrors: string[];
  liveDns: {
    /** Apex TXT records at senderDomain, filtered for SPF policies. */
    spf: SpfEvidence | null;
    /** TXT records at _dmarc.senderDomain. */
    dmarc: DmarcEvidence | null;
    /** Live DNS check for each Resend DKIM selector. */
    dkim: DkimEvidence[];
    /**
     * Live DNS check for every provider-supplied SPF record at its actual
     * record name under the sender domain (new in v2).
     */
    providerSpf: ProviderSpfDnsEvidence[];
  };
  dnsErrors: string[];
  limitations: string[];
  realDelivery:
    | { attempted: false; reason: string }
    | { attempted: false; reason: string; note: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract domain from a "Name <addr>" or plain "addr" string — never leaks local-part. */
function extractSenderDomain(fromEnv: string): string | null {
  const match = fromEnv.match(/<([^>]+)>/) ?? fromEnv.match(/(\S+)/);
  const addr = match?.[1] ?? null;
  if (!addr || !addr.includes("@")) return null;
  return addr.split("@")[1].toLowerCase().trim();
}

/** Remove mailbox addresses from any public evidence string. */
function redactMailboxData(text: string): string {
  return text
    .replace(/mailto:[^,;\s]+/gi, "mailto:[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
}

/** Defense in depth: scrub every string before serializing the evidence object. */
function sanitizeEvidenceValue<T>(value: T): T {
  if (typeof value === "string") return redactMailboxData(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEvidenceValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeEvidenceValue(item)])
    ) as T;
  }
  return value;
}

function getDmarcDisposition(policy: string | null): string {
  return policy?.match(/(?:^|;)\s*p=([^;]+)/i)?.[1]?.trim().toLowerCase() ?? "none";
}

/**
 * Returns a concise, non-secret summary of a DKIM public-key value.
 * Stores presence, length, sha256 of the raw value, and a 64-char prefix.
 */
function summariseDkimValue(raw: string): {
  valuePresent: true;
  valueLength: number;
  valueSha256: string;
  valuePrefix: string;
} {
  return {
    valuePresent: true,
    valueLength: raw.length,
    valueSha256: crypto.createHash("sha256").update(raw).digest("hex"),
    valuePrefix: raw.slice(0, 64),
  };
}

// ── DNS lookups ───────────────────────────────────────────────────────────────

async function querySpf(domain: string): Promise<SpfEvidence> {
  const queryName = domain;
  try {
    const records = await dns.resolveTxt(queryName);
    const flat = records.map((chunks) => chunks.join(""));
    const spfPolicies = flat.filter((r) => r.toLowerCase().startsWith("v=spf1"));
    return { queryName, found: flat.length > 0, records: flat, spfPolicies };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    const notFound = code === "ENODATA" || code === "ENOTFOUND" || code === "ENORECORDS";
    return {
      queryName,
      found: false,
      records: [],
      spfPolicies: [],
      error: notFound ? `No TXT records (${code})` : String((err as Error).message ?? err),
    };
  }
}

async function queryDmarc(domain: string): Promise<DmarcEvidence> {
  const queryName = `_dmarc.${domain}`;
  try {
    const records = await dns.resolveTxt(queryName);
    const flat = records.map((chunks) => chunks.join(""));
    const dmarcRec = flat.find((r) => r.toLowerCase().startsWith("v=dmarc1")) ?? null;
    return { queryName, found: flat.length > 0, records: flat, dmarcPolicy: dmarcRec };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    const notFound = code === "ENODATA" || code === "ENOTFOUND" || code === "ENORECORDS";
    return {
      queryName,
      found: false,
      records: [],
      dmarcPolicy: null,
      error: notFound ? `No TXT records (${code})` : String((err as Error).message ?? err),
    };
  }
}

async function queryDkimRecord(
  providerName: string,
  providerType: string,
  providerStatus: string,
  domain: string
): Promise<DkimEvidence> {
  // Extract selector from providerName, e.g. "resend._domainkey" → "resend"
  const nameParts = providerName.split(".");
  const selector = nameParts[0] ?? providerName;
  const dkimLookupName = `${selector}._domainkey.${domain}`;

  const base: Omit<DkimEvidence, "dnsResult"> = {
    selector,
    providerRecordName: providerName,
    providerRecordType: providerType,
    providerRecordStatus: providerStatus,
    dnsLookupName: dkimLookupName,
  };

  // Resend DKIM records are usually CNAME; some setups use TXT
  const resolveType = providerType.toUpperCase() === "TXT" ? "txt" : "cname";

  try {
    if (resolveType === "cname") {
      const result = await dns.resolveCname(dkimLookupName);
      // CNAME target is a public hostname (e.g. Resend's key server) — safe to record
      const cnameTarget = result[0] ?? "(empty)";
      const joined = result.join(", ");
      return {
        ...base,
        dnsResult: {
          found: true,
          type: "CNAME",
          ...summariseDkimValue(joined),
          cnameTarget,
        },
      };
    } else {
      // TXT record contains the DKIM public key — store only summary
      const result = await dns.resolveTxt(dkimLookupName);
      const flat = result.map((chunks) => chunks.join(""));
      const fullVal = flat.join(" ");
      return {
        ...base,
        dnsResult: {
          found: true,
          type: "TXT",
          ...summariseDkimValue(fullVal),
          // rawValues intentionally omitted; verify integrity via sha256/prefix
        },
      };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    const notFound = code === "ENODATA" || code === "ENOTFOUND" || code === "ENORECORDS";
    return {
      ...base,
      dnsResult: {
        found: false,
        error: notFound
          ? `No ${resolveType.toUpperCase()} record (${code})`
          : String((err as Error).message ?? err),
      },
    };
  }
}

/**
 * Query live DNS for one provider-supplied SPF record at its actual name under
 * the sender domain.  Supports TXT and MX record types.
 *
 * @param providerRec   One entry from providerEvidence.spfRecords
 * @param senderDomain  The verified sender domain, e.g. "traveloure.com"
 */
async function queryProviderSpfRecord(
  providerRec: ProviderDomainEvidence["spfRecords"][number],
  senderDomain: string
): Promise<ProviderSpfDnsEvidence> {
  // Build the fully-qualified name to look up.
  // providerRec.name is typically a bare label like "send"; we append the domain.
  // Guard: if the name already ends with the domain (or is "@") use it as-is.
  let dnsLookupName: string;
  const n = providerRec.name.trim();
  if (n === "@" || n === "" || n.toLowerCase() === senderDomain.toLowerCase()) {
    dnsLookupName = senderDomain;
  } else if (n.toLowerCase().endsWith(`.${senderDomain.toLowerCase()}`)) {
    dnsLookupName = n;
  } else {
    dnsLookupName = `${n}.${senderDomain}`;
  }

  const base: Omit<ProviderSpfDnsEvidence, "dnsResult"> = {
    providerRecordName: providerRec.name,
    providerRecordType: providerRec.type,
    providerRecordStatus: providerRec.status,
    providerRecordValue: providerRec.value,
    dnsLookupName,
  };

  const recordType = providerRec.type.toUpperCase();

  try {
    if (recordType === "MX") {
      const result = await dns.resolveMx(dnsLookupName);
      return {
        ...base,
        dnsResult: {
          found: true,
          type: "MX",
          exchanges: result.map((r) => ({ priority: r.priority, exchange: r.exchange })),
        },
      };
    } else {
      // TXT (default)
      const result = await dns.resolveTxt(dnsLookupName);
      const flat = result.map((chunks) => chunks.join(""));
      return {
        ...base,
        dnsResult: { found: true, type: "TXT", records: flat },
      };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    const notFound = code === "ENODATA" || code === "ENOTFOUND" || code === "ENORECORDS";
    return {
      ...base,
      dnsResult: {
        found: false,
        error: notFound
          ? `No ${recordType} record (${code})`
          : String((err as Error).message ?? err),
      },
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = new Date().toISOString();

  // ── Secret presence booleans (never print actual values) ──────────────────
  const apiKeyPresent = Boolean(process.env.RESEND_API_KEY);
  const fromNoreplyPresent = Boolean(process.env.EMAIL_FROM_NOREPLY);
  const fromPresent = Boolean(process.env.EMAIL_FROM);
  const tier4TestPresent = Boolean(process.env.TIER4_AUTHORIZED_TEST_EMAIL);

  // ── Derive sender domain (never log local-part or full address) ───────────
  const fromEnv = process.env.EMAIL_FROM_NOREPLY ?? process.env.EMAIL_FROM ?? "";
  const senderDomain = fromEnv ? extractSenderDomain(fromEnv) : null;

  console.log(`[audit] senderDomain: ${senderDomain ?? "(not configured)"}`);
  console.log(`[audit] RESEND_API_KEY present: ${apiKeyPresent}`);
  console.log(`[audit] EMAIL_FROM_NOREPLY present: ${fromNoreplyPresent}`);
  console.log(`[audit] EMAIL_FROM present: ${fromPresent}`);

  const providerErrors: string[] = [];
  const dnsErrors: string[] = [];
  const limitations: string[] = [];
  let providerEvidence: ProviderDomainEvidence | null = null;

  // ── Provider: Resend domain inventory ─────────────────────────────────────
  if (apiKeyPresent) {
    try {
      const client = new Resend(process.env.RESEND_API_KEY!);

      // List domains — read-only, no email send
      const listResp = await client.domains.list();
      if (listResp.error) {
        providerErrors.push(`Resend list domains error: ${listResp.error.message}`);
      } else {
        const domainList = listResp.data?.data ?? [];
        console.log(`[audit] Resend domain inventory count: ${domainList.length}`);

        // ── Domain selection logic (v2 hardened) ─────────────────────────────
        // Case A: senderDomain is known → require exact match; NO fallback.
        // Case B: no senderDomain configured → use first domain, mark as fallback.
        let targetDomainId: string | undefined;
        let fallbackUsed = false;

        if (senderDomain) {
          const matched = domainList.find(
            (d) => d.name.toLowerCase() === senderDomain.toLowerCase()
          );
          if (matched) {
            targetDomainId = matched.id;
          } else {
            // Sender domain known but not in inventory — leave providerEvidence null.
            limitations.push(
              `Sender domain "${senderDomain}" not found in Resend domain inventory ` +
                `(${domainList.length} domain(s) listed: ` +
                `${domainList.map((d) => d.name).join(", ") || "(none)"}). ` +
                `No provider match — provider evidence is null.`
            );
            console.log(
              `[audit] No provider match for senderDomain "${senderDomain}". ` +
                `Available: ${domainList.map((d) => d.name).join(", ") || "(none)"}`
            );
          }
        } else {
          // No sender configured — fall back to first domain with clear marking
          if (domainList.length > 0) {
            targetDomainId = domainList[0].id;
            fallbackUsed = true;
            limitations.push(
              `No sender domain configured. Falling back to first Resend inventory domain ` +
                `"${domainList[0].name}" (fallbackUsed=true). ` +
                `Set EMAIL_FROM_NOREPLY or EMAIL_FROM for an exact match.`
            );
            console.log(
              `[audit] No senderDomain — using first inventory domain "${domainList[0].name}" ` +
                `(fallbackUsed=true)`
            );
          } else {
            limitations.push("No Resend domains found in inventory.");
          }
        }

        // ── Fetch full domain record ──────────────────────────────────────────
        if (targetDomainId) {
          const getResp = await client.domains.get(targetDomainId);
          if (getResp.error) {
            providerErrors.push(
              `Resend get domain (id=${targetDomainId}) error: ${getResp.error.message}`
            );
          } else if (getResp.data) {
            const d = getResp.data;

            // Collect ALL SPF records (v2: was a single find())
            const spfRecs = (d.records ?? []).filter((r) => r.record === "SPF");
            const dkimRecs = (d.records ?? []).filter((r) => r.record === "DKIM");

            providerEvidence = {
              domainId: d.id,
              domainName: d.name,
              fallbackUsed,
              status: d.status,
              region: d.region,
              capabilities: {
                sending: d.capabilities?.sending ?? "unknown",
                receiving: d.capabilities?.receiving ?? "unknown",
              },
              openTracking: d.open_tracking,
              clickTracking: d.click_tracking,
              // All SPF records from Resend — values are short hostnames, not secrets
              spfRecords: spfRecs.map((r) => ({
                name: r.name,
                type: r.type,
                status: r.status,
                value: r.value,
              })),
              // DKIM: name/type/status only — full public key omitted; summarised in liveDns.dkim
              dkimRecords: dkimRecs.map((r) => ({
                name: r.name,
                type: r.type,
                status: r.status,
              })),
            };

            console.log(
              `[audit] Resend domain "${d.name}" status=${d.status} region=${d.region} ` +
                `SPF records=${spfRecs.length} DKIM records=${dkimRecs.length} ` +
                `fallbackUsed=${fallbackUsed}`
            );
          }
        }
      }
    } catch (err: unknown) {
      providerErrors.push(
        `Resend API call failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    limitations.push("RESEND_API_KEY not set — Resend domain inventory skipped.");
  }

  // ── Live DNS evidence ─────────────────────────────────────────────────────
  const liveDns: AuditReport["liveDns"] = {
    spf: null,
    dmarc: null,
    dkim: [],
    providerSpf: [],
  };

  // Use the explicitly configured sender domain; only fall back to provider
  // domain name when providerEvidence.fallbackUsed is true (meaning no sender
  // was configured and we're already using a fallback domain).
  const auditDomain =
    senderDomain ??
    (providerEvidence?.fallbackUsed ? providerEvidence.domainName : null);

  if (auditDomain) {
    console.log(`[audit] Querying live DNS for domain: ${auditDomain}`);

    // ── Apex SPF ──────────────────────────────────────────────────────────
    try {
      liveDns.spf = await querySpf(auditDomain);
      console.log(
        `[audit] SPF found=${liveDns.spf.found} policies=${liveDns.spf.spfPolicies.length}`
      );
    } catch (err: unknown) {
      dnsErrors.push(`SPF query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── DMARC ─────────────────────────────────────────────────────────────
    try {
      liveDns.dmarc = await queryDmarc(auditDomain);
      console.log(
        `[audit] DMARC found=${liveDns.dmarc.found} ` +
          `policy=${getDmarcDisposition(liveDns.dmarc.dmarcPolicy)}`
      );
    } catch (err: unknown) {
      dnsErrors.push(`DMARC query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── DKIM ─────────────────────────────────────────────────────────────
    if (providerEvidence && providerEvidence.dkimRecords.length > 0) {
      for (const rec of providerEvidence.dkimRecords) {
        try {
          const evidence = await queryDkimRecord(
            rec.name,
            rec.type,
            rec.status,
            auditDomain
          );
          liveDns.dkim.push(evidence);
          console.log(
            `[audit] DKIM selector="${evidence.selector}" found=${evidence.dnsResult.found}`
          );
        } catch (err: unknown) {
          dnsErrors.push(
            `DKIM query for "${rec.name}" failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } else {
      limitations.push(
        "No DKIM selector information available from Resend " +
          "(domain not in inventory or API unavailable). DKIM DNS check skipped."
      );
    }

    // ── Provider SPF records — live DNS check (new in v2) ─────────────────
    if (providerEvidence && providerEvidence.spfRecords.length > 0) {
      for (const spfRec of providerEvidence.spfRecords) {
        try {
          const evidence = await queryProviderSpfRecord(spfRec, auditDomain);
          liveDns.providerSpf.push(evidence);
          console.log(
            `[audit] providerSpf name="${spfRec.name}" type=${spfRec.type} ` +
              `lookupName="${evidence.dnsLookupName}" found=${evidence.dnsResult.found}`
          );
        } catch (err: unknown) {
          dnsErrors.push(
            `providerSpf query for "${spfRec.name}" failed: ` +
              `${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } else if (providerEvidence) {
      limitations.push(
        "Resend reported no SPF records for this domain — providerSpf DNS check skipped."
      );
    }
    // If providerEvidence is null, the DKIM block already captured the limitation.
  } else {
    limitations.push(
      "Sender domain could not be determined and no unambiguous fallback is available — " +
        "live DNS checks skipped."
    );
  }

  // ── Real delivery section ─────────────────────────────────────────────────
  let realDelivery: AuditReport["realDelivery"];
  if (tier4TestPresent) {
    realDelivery = {
      attempted: false,
      reason: "No authorized inspectable test inbox configured",
      note:
        "TIER4_AUTHORIZED_TEST_EMAIL is set. A separate, explicitly authorized delivery " +
        "step COULD be run by a dedicated script, but this audit script never sends email.",
    };
  } else {
    realDelivery = {
      attempted: false,
      reason: "No authorized inspectable test inbox configured",
    };
  }

  // ── Assemble report ───────────────────────────────────────────────────────
  const report: AuditReport = {
    auditVersion: "tier4-email-auth-v2",
    generatedAtUtc: now,
    secrets: {
      RESEND_API_KEY_present: apiKeyPresent,
      EMAIL_FROM_NOREPLY_present: fromNoreplyPresent,
      EMAIL_FROM_present: fromPresent,
      TIER4_AUTHORIZED_TEST_EMAIL_present: tier4TestPresent,
    },
    senderDomain,
    provider: providerEvidence,
    providerErrors,
    liveDns,
    dnsErrors,
    limitations,
    realDelivery,
  };

  // ── Write JSON output ─────────────────────────────────────────────────────
  const outDir = path.resolve("docs/audits/tier4-evidence");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "email-auth.json");
  const sanitizedReport = sanitizeEvidenceValue(report);
  await fs.writeFile(outFile, JSON.stringify(sanitizedReport, null, 2) + "\n", "utf-8");

  // ── Console summary (public evidence only) ────────────────────────────────
  console.log(`\n[audit] Report written to: ${outFile}`);
  console.log("[audit] Summary:");
  console.log(`  auditVersion:           ${report.auditVersion}`);
  console.log(`  senderDomain:           ${report.senderDomain ?? "(unknown)"}`);
  console.log(
    `  provider status:        ${providerEvidence?.status ?? "(no match)"} ` +
      (providerEvidence?.fallbackUsed ? "[fallback]" : "")
  );
  console.log(`  provider region:        ${providerEvidence?.region ?? "(no match)"}`);
  console.log(
    `  provider SPF records:   ${providerEvidence?.spfRecords.length ?? 0} ` +
      `(${providerEvidence?.spfRecords.map((r) => `${r.name}/${r.type}=${r.status}`).join(", ") || "none"})`
  );
  console.log(
    `  SPF apex found:         ${report.liveDns.spf?.found ?? false}` +
      (report.liveDns.spf?.error ? ` (${report.liveDns.spf.error})` : "")
  );
  console.log(
    `  DMARC found:            ${report.liveDns.dmarc?.found ?? false}` +
      (report.liveDns.dmarc?.error ? ` (${report.liveDns.dmarc.error})` : "")
  );
  console.log(`  DKIM records checked:   ${report.liveDns.dkim.length}`);
  if (report.liveDns.dkim.length > 0) {
    const dkimPass = report.liveDns.dkim.filter((r) => r.dnsResult.found).length;
    const dkimFail = report.liveDns.dkim.length - dkimPass;
    console.log(`  DKIM DNS:               ${dkimPass} found, ${dkimFail} not found`);
  }
  console.log(`  providerSpf checked:    ${report.liveDns.providerSpf.length}`);
  if (report.liveDns.providerSpf.length > 0) {
    for (const ps of report.liveDns.providerSpf) {
      const detail =
        ps.dnsResult.found
          ? ps.dnsResult.type === "MX"
            ? `MX exchanges=${ps.dnsResult.exchanges.length}`
            : `TXT records=${ps.dnsResult.records.length}`
          : `NOT FOUND (${ps.dnsResult.error})`;
      console.log(`    ${ps.dnsLookupName} [${ps.providerRecordType}]: ${detail}`);
    }
  }
  if (providerErrors.length > 0) {
    console.log(`  providerErrors:         ${providerErrors.join("; ")}`);
  }
  if (dnsErrors.length > 0) {
    console.log(`  dnsErrors:              ${dnsErrors.join("; ")}`);
  }
  if (limitations.length > 0) {
    console.log(`  limitations:`);
    for (const l of limitations) {
      console.log(`    - ${l}`);
    }
  }
  console.log(`  realDelivery:           attempted=false`);
}

main().catch((err: unknown) => {
  console.error(
    "[audit] Fatal error:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
