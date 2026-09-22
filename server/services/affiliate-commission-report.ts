export interface AffiliateCommissionReport {
  configured: boolean;
  thisMonth: number | null;
  lastMonth: number | null;
  total: number | null;
  currency: string;
}

export interface AffiliateRevenueSummary {
  total: number;
  partial: boolean;
  unknownPartners: string[];
}

export function parseAffiliateAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeAffiliateRevenue(
  reports: Array<{ name: string; report: AffiliateCommissionReport }>,
): AffiliateRevenueSummary {
  const configured = reports.filter(({ report }) => report.configured);
  const unknownPartners = configured
    .filter(({ report }) => report.total === null)
    .map(({ name }) => name);

  return {
    total: configured.reduce((sum, { report }) => sum + (report.total ?? 0), 0),
    partial: unknownPartners.length > 0,
    unknownPartners,
  };
}

export function formatAffiliateAmount(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}