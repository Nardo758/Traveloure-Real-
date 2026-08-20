import { inflateSync } from "node:zlib";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

// Server-enforced image upload limits (the client's 5MB check in profile.tsx is advisory;
// the server is the authority). Applies to base64 data-URL image fields (e.g. govId,
// travelLicence on the expert application).
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_DECODED_PIXEL_BYTES = 64 * 1024 * 1024;

export interface ImageValidationOptions {
  maxBytes?: number;
  allowedMimeTypes?: readonly string[];
}

function hasValidGifLzw(
  compressed: Buffer,
  minimumCodeSize: number,
  expectedPixels: number,
  colorCount: number,
): boolean {
  if (minimumCodeSize < 2 || minimumCodeSize > 8 || expectedPixels <= 0 || colorCount <= 0) return false;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bitOffset = 0;
  let sawClear = false;
  let sawEnd = false;
  let pixels = 0;
  let previous: number[] | null = null;
  let dictionary: Array<number[] | undefined> = [];

  const reset = () => {
    dictionary = new Array(4096);
    for (let index = 0; index < clearCode; index++) dictionary[index] = [index];
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
    previous = null;
  };
  const readCode = (): number | null => {
    if (bitOffset + codeSize > compressed.length * 8) return null;
    let code = 0;
    for (let bit = 0; bit < codeSize; bit++) {
      const sourceBit = bitOffset + bit;
      code |= ((compressed[sourceBit >> 3] >> (sourceBit & 7)) & 1) << bit;
    }
    bitOffset += codeSize;
    return code;
  };

  reset();
  while (bitOffset < compressed.length * 8) {
    const code = readCode();
    if (code === null) break;
    if (code === clearCode) {
      reset();
      sawClear = true;
      continue;
    }
    if (!sawClear) return false;
    if (code === endCode) {
      sawEnd = true;
      break;
    }

    let entry = dictionary[code];
    if (!entry && code === nextCode && previous) {
      entry = [...previous, previous[0]];
    }
    if (!entry || entry.length === 0) return false;
    for (const colorIndex of entry) {
      if (colorIndex >= colorCount || ++pixels > expectedPixels) return false;
    }

    if (previous && nextCode < 4096) {
      dictionary[nextCode++] = [...previous, entry[0]];
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    previous = entry;
  }
  return sawClear && sawEnd && pixels === expectedPixels;
}

function hasValidImageStructure(bytes: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") {
    if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    let offset = 2;
    let hasFrame = false;
    let hasScan = false;
    const frameComponents = new Map<number, number>();
    const quantizationTables = new Set<number>();
    while (offset < bytes.length) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return false;
      const marker = bytes[offset++];
      if (marker === 0xd9) {
        const hasRequiredTables = Array.from(frameComponents.values()).every((tableId) => quantizationTables.has(tableId));
        if (!hasFrame || !hasScan || !hasRequiredTables || offset !== bytes.length) return false;
        try {
          const decoded = decodeJpeg(bytes, {
            useTArray: true,
            formatAsRGBA: false,
            tolerantDecoding: false,
            maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000,
            maxMemoryUsageInMB: MAX_DECODED_PIXEL_BYTES / (1024 * 1024),
          });
          return decoded.width > 0 && decoded.height > 0
            && decoded.width * decoded.height <= MAX_IMAGE_PIXELS
            && decoded.data.length > 0;
        } catch {
          return false;
        }
      }
      if (marker === 0x00 || marker === 0xd8) return false;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return false;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return false;
      if (marker === 0xdb) {
        let cursor = offset + 2;
        const end = offset + length;
        while (cursor < end) {
          const tableInfo = bytes[cursor++];
          const precision = tableInfo >> 4;
          const tableId = tableInfo & 0x0f;
          if (precision > 1 || tableId > 3) return false;
          const tableBytes = precision === 0 ? 64 : 128;
          if (cursor + tableBytes > end) return false;
          quantizationTables.add(tableId);
          cursor += tableBytes;
        }
        if (cursor !== end) return false;
      }
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (hasFrame || length < 11) return false;
        const precision = bytes[offset + 2];
        const height = bytes.readUInt16BE(offset + 3);
        const width = bytes.readUInt16BE(offset + 5);
        const componentCount = bytes[offset + 7];
        if (![8, 12].includes(precision) || !width || !height || width * height > MAX_IMAGE_PIXELS
          || componentCount < 1 || componentCount > 4 || length !== 8 + 3 * componentCount) return false;
        for (let index = 0; index < componentCount; index++) {
          const componentOffset = offset + 8 + index * 3;
          const componentId = bytes[componentOffset];
          const sampling = bytes[componentOffset + 1];
          const horizontalSampling = sampling >> 4;
          const verticalSampling = sampling & 0x0f;
          const tableId = bytes[componentOffset + 2];
          if (frameComponents.has(componentId) || horizontalSampling < 1 || horizontalSampling > 4
            || verticalSampling < 1 || verticalSampling > 4 || tableId > 3) return false;
          frameComponents.set(componentId, tableId);
        }
        hasFrame = true;
      }
      if (marker === 0xda) {
        if (!hasFrame || length < 8) return false;
        const scanComponentCount = bytes[offset + 2];
        if (scanComponentCount < 1 || scanComponentCount > frameComponents.size
          || length !== 6 + 2 * scanComponentCount) return false;
        const seenScanComponents = new Set<number>();
        for (let index = 0; index < scanComponentCount; index++) {
          const componentId = bytes[offset + 3 + index * 2];
          const tableSelectors = bytes[offset + 4 + index * 2];
          if (!frameComponents.has(componentId) || seenScanComponents.has(componentId)
            || (tableSelectors >> 4) > 3 || (tableSelectors & 0x0f) > 3) return false;
          seenScanComponents.add(componentId);
        }
        const spectralOffset = offset + 3 + 2 * scanComponentCount;
        const spectralStart = bytes[spectralOffset];
        const spectralEnd = bytes[spectralOffset + 1];
        const approximation = bytes[spectralOffset + 2];
        if (spectralStart > spectralEnd || spectralEnd > 63
          || (approximation >> 4) > 13 || (approximation & 0x0f) > 13) return false;
        offset += length;
        // Entropy data runs until the next unstuffed marker.
        let entropyBytes = 0;
        while (offset + 1 < bytes.length) {
          if (bytes[offset] !== 0xff) {
            entropyBytes++;
            offset++;
            continue;
          }
          const next = bytes[offset + 1];
          if (next === 0x00) {
            entropyBytes++;
            offset += 2;
            continue;
          }
          if (next === 0xff) {
            offset++;
            continue;
          }
          if (next >= 0xd0 && next <= 0xd7) {
            if (entropyBytes === 0) return false;
            offset += 2;
            continue;
          }
          break;
        }
        if (entropyBytes === 0) return false;
        hasScan = true;
      } else {
        offset += length;
      }
    }
    return false;
  }
  if (mime === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return false;
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    const idat: Buffer[] = [];
    let sawHeader = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      const end = offset + 12 + length;
      if (end > bytes.length) return false;
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      if (!sawHeader) {
        if (type !== "IHDR" || length !== 13) return false;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        if (!width || !height || data[12] !== 0) return false;
        sawHeader = true;
      } else if (type === "IDAT") {
        idat.push(data);
      } else if (type === "IEND") {
        if (length !== 0 || end !== bytes.length || idat.length === 0) return false;
        const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
        if (!channels || ![1, 2, 4, 8, 16].includes(bitDepth)) return false;
        try {
          const rowBytes = Math.ceil(width * channels * bitDepth / 8);
          const expectedBytes = height * (rowBytes + 1);
          if (width * height > MAX_IMAGE_PIXELS || expectedBytes > MAX_DECODED_PIXEL_BYTES) return false;
          const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedBytes });
           if (decoded.length !== expectedBytes) return false;

           // The bounded inflate above keeps decoder work within the upload's declared
           // dimensions. pngjs then verifies CRCs and actual scanline/filter semantics,
           // which a signature/dimension-only check cannot prove.
           const parsed = PNG.sync.read(bytes, { checkCRC: true });
           return parsed.width === width
             && parsed.height === height
             && parsed.width * parsed.height <= MAX_IMAGE_PIXELS
             && parsed.data.length > 0;
        } catch {
          return false;
        }
      }
      offset = end;
    }
    return false;
  }
  if (mime === "image/gif") {
    const header = bytes.subarray(0, 6).toString("ascii");
    if (bytes.length < 20 || (header !== "GIF87a" && header !== "GIF89a")) return false;
    const width = bytes.readUInt16LE(6);
    const height = bytes.readUInt16LE(8);
    if (!width || !height) return false;
    const packed = bytes[10];
    let offset = 13;
    const globalColorCount = packed & 0x80 ? 2 ** ((packed & 0x07) + 1) : 0;
    if (globalColorCount) offset += 3 * globalColorCount;
    if (offset > bytes.length) return false;
    let hasImage = false;
    const readSubBlocks = (): Buffer | null => {
      const chunks: Buffer[] = [];
      while (offset < bytes.length) {
        const size = bytes[offset++];
        if (size === 0) return Buffer.concat(chunks);
        if (offset + size > bytes.length) return null;
        chunks.push(bytes.subarray(offset, offset + size));
        offset += size;
      }
      return null;
    };
    while (offset < bytes.length) {
      const introducer = bytes[offset++];
      if (introducer === 0x3b) return hasImage && offset === bytes.length;
      if (introducer === 0x21) {
        if (offset >= bytes.length) return false;
        offset++; // extension label
        if (readSubBlocks() === null) return false;
        continue;
      }
      if (introducer !== 0x2c || offset + 9 > bytes.length) return false;
      const imageLeft = bytes.readUInt16LE(offset);
      const imageTop = bytes.readUInt16LE(offset + 2);
      const imageWidth = bytes.readUInt16LE(offset + 4);
      const imageHeight = bytes.readUInt16LE(offset + 6);
      const imagePacked = bytes[offset + 8];
      if (!imageWidth || !imageHeight || imageWidth * imageHeight > MAX_IMAGE_PIXELS
        || imageLeft + imageWidth > width || imageTop + imageHeight > height) return false;
      offset += 9;
      const localColorCount = imagePacked & 0x80 ? 2 ** ((imagePacked & 0x07) + 1) : 0;
      if (localColorCount) offset += 3 * localColorCount;
      const activeColorCount = localColorCount || globalColorCount;
      if (!activeColorCount || offset >= bytes.length) return false;
      const minimumCodeSize = bytes[offset++];
      const compressed = readSubBlocks();
      if (!compressed || !hasValidGifLzw(
        compressed,
        minimumCodeSize,
        imageWidth * imageHeight,
        activeColorCount,
      )) return false;
      hasImage = true;
    }
    return false;
  }
  return false;
}

// Strict: when a value is present (non-empty), it MUST be an allowed `data:image/*;base64,`
// URL with a valid base64 payload under the size cap. Non-data-URL strings are rejected —
// otherwise an arbitrary oversized text blob would bypass both the size and MIME checks.
// Returns an error message, or null if valid / absent.
export function validateImageDataUrl(
  value: unknown,
  fieldName: string,
  options: ImageValidationOptions = {},
): string | null {
  if (value === undefined || value === null) return null; // field not provided
  if (typeof value !== "string") return `${fieldName} must be a string`;
  if (value.trim() === "") return null; // explicit clear — nothing to enforce
  const match = value.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) {
    return `${fieldName} must be a base64-encoded image data URL (data:image/...;base64,...)`;
  }
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const allowed = new Set(options.allowedMimeTypes ?? ALLOWED_IMAGE_MIME_TYPES);
  if (!allowed.has(mime)) {
    return `${fieldName} must be a JPEG, PNG or GIF image`;
  }
  const payload = match[2];
  if (payload.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 !== 0) {
    return `${fieldName} contains invalid base64 image data`;
  }
  // Exact decoded size: 3 bytes per 4 base64 chars, minus padding
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = (payload.length / 4) * 3 - padding;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_UPLOAD_BYTES;
  if (decodedBytes > maxBytes) {
    return `${fieldName} must be under ${Math.floor(maxBytes / (1024 * 1024))}MB`;
  }
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length !== decodedBytes || !hasValidImageStructure(bytes, mime)) {
    return `${fieldName} content does not match a complete ${mime} image`;
  }
  return null;
}
