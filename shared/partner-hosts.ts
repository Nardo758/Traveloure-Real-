/**
 * THE partner-host rule, stated once (ledger `2026-09-28-landing-doors`; Locked Decision 57 ruling 4).
 *
 * A URL is "on a partner's domain" when its host equals a partner host or is a subdomain of it —
 * an exact-suffix test, so a domain that merely CONTAINS a partner's name is not matched. The
 * partner hosts themselves are never typed here: they are read from the registry
 * (`affiliate_partners.website_url`, the only partner table that carries domains) by the ONE loader
 * `loadPartnerHosts` in `server/services/partner-hosts.service.ts`. Two callers, one rule (§18
 * rule 1): the blog's source admission refuses a source on a partner domain, and `city_events`
 * refuses a ticket link on one. A second hand-typed list beside the registry is the drift this
 * module exists to prevent.
 */

/** A URL's host, lower-cased with any leading `www.` dropped; a scheme-less URL is read as https. */
export function partnerHostOf(url: string): string | null {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Pure. True when `host` is a partner host or a subdomain of one. */
export function isOnPartnerHost(host: string, partnerHosts: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return partnerHosts.some((p) => h === p || h.endsWith(`.${p}`));
}
