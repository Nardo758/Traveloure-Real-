/**
 * The expert's Share kit for an APPROVED Ready Made Trip (Slice B2 — work plan L3-14; ledger
 * `2026-10-05-rmt-share-images`): copy the public link (`/t/<slug>`, B1) and download the four
 * generated cards. The cards are the server's (`/api/share-image/ready-made/:id.png`), generated when
 * the listing was approved and re-rendered whenever what they say changes; nothing here draws one.
 * Shown only for an approved listing — a draft has no public page and no cards (the server 404s).
 *
 * Instagram does not make a caption link clickable, so the kit says where the link goes: the Story
 * link sticker and the bio.
 */
import { useState } from "react";
import { readyMadePreviewPath } from "@shared/ready-made-preview";

export const SHARE_KIT_IMAGES = [
  { format: "cover", label: "Feed cover", size: "1080×1350" },
  { format: "map", label: "Route slide", size: "1080×1350" },
  { format: "story", label: "Story", size: "1080×1920" },
  { format: "og", label: "Link card", size: "1200×630" },
] as const;

/** Pure: the link to copy and the four download links. */
export function readyMadeShareKitLinks(listing: { id: string; title?: string | null }, origin: string) {
  const pagePath = readyMadePreviewPath(listing);
  return {
    pageUrl: `${origin}${pagePath}`,
    images: SHARE_KIT_IMAGES.map((i) => ({ ...i, href: `/api/share-image/ready-made/${listing.id}.png?format=${i.format}&download=1` })),
  };
}

export function ReadyMadeShareKit({ listing }: { listing: { id: string; title?: string | null } }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://traveloure.com";
  const { pageUrl, images } = readyMadeShareKitLinks(listing, origin);
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ border: "1px solid #E8E8E2", borderRadius: 10, padding: "10px 11px", marginBottom: 14, background: "white" }} data-testid="rm-share-kit">
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#E85D55", marginBottom: 6 }}>Share</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <input readOnly value={pageUrl} style={{ flex: 1, minWidth: 0, fontSize: 11, border: "1px solid #E8E8E2", borderRadius: 6, padding: "4px 6px" }} data-testid="rm-share-link" />
        <button
          type="button"
          onClick={() => { void navigator.clipboard?.writeText(pageUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          style={{ fontSize: 11, fontWeight: 700, border: "1px solid #1A1A18", borderRadius: 6, padding: "4px 8px", background: "white", cursor: "pointer" }}
          data-testid="rm-share-copy"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {images.map((i) => (
          <a key={i.format} href={i.href} download style={{ fontSize: 11, border: "1px solid #E8E8E2", borderRadius: 6, padding: "5px 7px", color: "#1A1A18", textDecoration: "none" }} data-testid={`rm-share-download-${i.format}`}>
            ↓ {i.label} <span style={{ color: "#7A7A72" }}>{i.size}</span>
          </a>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "#7A7A72", lineHeight: 1.45 }}>
        Instagram captions don't make links clickable — put this link on a Story link sticker or in your bio.
      </p>
    </div>
  );
}
