/**
 * qrcode.ts — a small, dependency-free QR Code generator used by the Distribute Direct-link
 * channel (Catalog+Distribute ruling 74, lane D2) to render a scannable QR for a provider's own
 * tracked short link.
 *
 * WHY VENDORED, NOT A DEPENDENCY: the repo carries no QR library, and adding an npm dependency
 * risks the lockfile-purity gate (CLAUDE.md "Lockfile purity") and the client build. This is a
 * faithful TypeScript port of Nayuki's "QR Code generator" (MIT-licensed, project Nayuki), trimmed
 * to byte-mode text encoding — enough for a short URL. It computes the module matrix itself
 * (finder/timing/alignment patterns, Reed–Solomon error correction, mask selection by penalty), so
 * the QR it draws is a REAL, standards-conformant code that scans — never a decorative placeholder
 * (§13: no dishonest "it looks like a QR" render).
 *
 * Only `qrCodeSvgDataUrl(text)` is exported — it returns an inline SVG `data:` URL that renders in
 * an <img> and downloads as a file, with no canvas, no network, and no external host (CSP-safe).
 */

// ── Reed–Solomon over GF(256) with the QR generator polynomial (0x11D) ─────────────────────────
function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsComputeRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < result.length; i++) result[i] ^= rsMultiply(divisor[i], factor);
  }
  return result;
}

// ── Per-version error-correction tables (level M) ──────────────────────────────────────────────
// Indexed by version 1..40. [ECC codewords per block, number of error-correction blocks].
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK_M[ver] * NUM_ERROR_CORRECTION_BLOCKS_M[ver]
  );
}

// ── The QR matrix builder ──────────────────────────────────────────────────────────────────────
class QrCode {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    private readonly dataCodewords: number[],
  ) {
    this.size = version * 4 + 17;
    const size = this.size;
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    // Pick the mask with the lowest penalty.
    let minPenalty = Infinity;
    let bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormatBits(mask);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestMask = mask;
      }
      this.applyMask(mask); // XOR again to undo
    }
    this.applyMask(bestMask);
    this.drawFormatBits(bestMask);
  }

  getModule(x: number, y: number): boolean {
    return this.modules[y][x];
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(size - 4, 3);
    this.drawFinderPattern(3, size - 4);

    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        ) {
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
        }
      }
    }

    this.drawFormatBits(0); // dummy; real bits set after masking
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private drawFormatBits(mask: number): void {
    // Format info: EC level M = 0b00, mask (3 bits). BCH(15,5) + XOR mask.
    const data = (0b00 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0);
    this.setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0);
    this.setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0);

    const size = this.size;
    for (let i = 0; i < 8; i++) this.setFunctionModule(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, size - 8, true); // always-dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const result: number[] = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = rsComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = rsComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(blocks[j][i]);
        }
      }
    }
    return result;
  }

  private drawCodewords(data: number[]): void {
    let i = 0;
    const size = this.size;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Adjacent same-color runs in rows and columns.
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      for (let x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result++;
        } else {
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      for (let y = 0; y < size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result++;
        } else {
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
    }

    // 2x2 blocks of same color.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }

    // Proportion of dark modules.
    let dark = 0;
    for (const row of this.modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }

  static encodeText(text: string): QrCode {
    // Byte-mode segment (UTF-8) — sufficient for a URL.
    const bytes: number[] = [];
    for (const cp of unescape(encodeURIComponent(text))) bytes.push(cp.charCodeAt(0));

    // Choose the smallest version whose data capacity fits (level M).
    for (let version = 1; version <= 40; version++) {
      const dataCapacityBits = getNumDataCodewords(version) * 8;
      const charCountBits = version <= 9 ? 8 : 16;
      const usedBits = 4 + charCountBits + bytes.length * 8;
      if (usedBits > dataCapacityBits) continue;

      const bb: number[] = [];
      const appendBits = (val: number, len: number) => {
        for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
      };
      appendBits(0b0100, 4); // byte mode
      appendBits(bytes.length, charCountBits);
      for (const b of bytes) appendBits(b, 8);

      // Terminator + bit/byte padding.
      appendBits(0, Math.min(4, dataCapacityBits - bb.length));
      while (bb.length % 8 !== 0) bb.push(0);
      const dataCodewords: number[] = [];
      for (let i = 0; i < bb.length; i += 8) {
        let cw = 0;
        for (let j = 0; j < 8; j++) cw = (cw << 1) | bb[i + j];
        dataCodewords.push(cw);
      }
      for (let pad = 0xec; dataCodewords.length < getNumDataCodewords(version); pad ^= 0xec ^ 0x11) {
        dataCodewords.push(pad);
      }
      return new QrCode(version, dataCodewords);
    }
    throw new Error("Data too long for a QR code");
  }
}

/**
 * Render `text` (a URL) as a scannable QR code, returned as an inline SVG `data:` URL suitable for
 * both an <img src> and a download link. Black modules on a white quiet-zone background.
 */
export function qrCodeSvgDataUrl(text: string, moduleSize = 8, border = 4): string {
  const qr = QrCode.encodeText(text);
  const dim = (qr.size + border * 2) * moduleSize;
  let path = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const px = (x + border) * moduleSize;
        const py = (y + border) * moduleSize;
        path += `M${px},${py}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
