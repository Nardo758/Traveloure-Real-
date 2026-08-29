import type { VendorWithCreator } from "@shared/schema";

export const VENDOR_AUDIT_EXPORT_HEADERS = [
  "id",
  "name",
  "category",
  "description",
  "vendor_email",
  "phone",
  "website",
  "address",
  "city",
  "country",
  "rating",
  "price_range",
  "status",
  "created_at",
  "updated_at",
  "creator_name",
  "creator_email",
  "creator_origin",
] as const;

function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "");

  // Prefix values that spreadsheet applications may interpret as formulas. Keep the
  // apostrophe in the exported value so opening the file cannot execute the formula.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  // RFC 4180-style quoting keeps commas, quotes, and line breaks inside one cell.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatVendorAuditCsv(vendorList: VendorWithCreator[]): string {
  const rows = vendorList.map((vendor) => {
    const creatorName = [vendor.createdBy?.firstName, vendor.createdBy?.lastName]
      .filter(Boolean)
      .join(" ");
    const hasCreator = Boolean(vendor.createdBy);

    return [
      vendor.id,
      vendor.name,
      vendor.category,
      vendor.description,
      vendor.email,
      vendor.phone,
      vendor.website,
      vendor.address,
      vendor.city,
      vendor.country,
      vendor.rating,
      vendor.priceRange,
      vendor.status,
      vendor.createdAt?.toISOString(),
      vendor.updatedAt?.toISOString(),
      creatorName || (hasCreator ? vendor.createdBy?.email : null) || "Unknown origin",
      vendor.createdBy?.email || "Unknown origin",
      hasCreator ? "Account" : "Unknown origin",
    ].map(escapeCsvCell).join(",");
  });

  return [VENDOR_AUDIT_EXPORT_HEADERS.join(","), ...rows].join("\r\n") + "\r\n";
}