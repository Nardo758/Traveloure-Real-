import type { VendorCreator } from "@shared/schema";

export function getVendorCreatorLabel(creator: VendorCreator | null | undefined): string {
  const name = [creator?.firstName, creator?.lastName].filter(Boolean).join(" ");
  return name || creator?.email || "Unknown origin";
}