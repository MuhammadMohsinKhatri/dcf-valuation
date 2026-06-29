import { deflateSync } from "zlib";

// CRC32 lookup table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([tb, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  return Buffer.concat([lenBuf, tb, data, crcBuf]);
}

export interface FFBar {
  label: string;
  lo: number;
  mid: number;
  hi: number;
  r: number;
  g: number;
  b: number;
}

export function generateFootballFieldPNG(bars: FFBar[], currentPrice: number): Buffer {
  const W = 780;
  const BAR_H = 30;
  const BAR_GAP = 18;
  const LABEL_W = 130;
  const PAD_TOP = 42;
  const PAD_BOT = 46;
  const PAD_RIGHT = 20;
  const CHART_X = LABEL_W + 10;
  const CHART_W = W - CHART_X - PAD_RIGHT;
  const H = PAD_TOP + bars.length * (BAR_H + BAR_GAP) + PAD_BOT;

  const pixels = Buffer.alloc(W * H * 3, 255); // white bg

  const allVals = bars.flatMap((b) => [b.lo, b.hi]);
  if (currentPrice > 0) allVals.push(currentPrice);
  const minV = Math.min(...allVals) * 0.88;
  const maxV = Math.max(...allVals) * 1.12;

  function vx(v: number) {
    return CHART_X + Math.round(((v - minV) / (maxV - minV)) * CHART_W);
  }

  function px(x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 3;
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }

  function rect(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number) {
    for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++)
      for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++)
        px(x, y, r, g, b);
  }

  function vline(x: number, y1: number, y2: number, r: number, g: number, b: number, w = 2) {
    for (let dx = 0; dx < w; dx++)
      for (let y = y1; y <= y2; y++) px(x + dx, y, r, g, b);
  }

  // Title bar — dark navy
  rect(0, 0, W - 1, PAD_TOP - 4, 15, 55, 100);

  // Chart area bg
  rect(CHART_X, PAD_TOP - 2, W - PAD_RIGHT, H - PAD_BOT + 4, 245, 247, 250);

  // Grid lines (5 vertical, light gray)
  for (let i = 0; i <= 4; i++) {
    const gx = CHART_X + Math.round((i / 4) * CHART_W);
    rect(gx, PAD_TOP - 2, gx, H - PAD_BOT + 4, 210, 215, 220);
  }

  // Bars
  bars.forEach((bar, i) => {
    const y1 = PAD_TOP + i * (BAR_H + BAR_GAP);
    const y2 = y1 + BAR_H;
    const x1 = vx(bar.lo);
    const x2 = vx(bar.hi);
    const xm = vx(bar.mid);

    // Light-tinted range fill
    const lr = Math.min(255, bar.r + 100);
    const lg = Math.min(255, bar.g + 100);
    const lb = Math.min(255, bar.b + 100);
    rect(x1, y1, x2, y2, lr, lg, lb);

    // Solid mid accent
    rect(xm - 3, y1, xm + 3, y2, bar.r, bar.g, bar.b);

    // Bar border (full color)
    rect(x1, y1, x2, y1, bar.r, bar.g, bar.b);
    rect(x1, y2, x2, y2, bar.r, bar.g, bar.b);
    rect(x1, y1, x1, y2, bar.r, bar.g, bar.b);
    rect(x2, y1, x2, y2, bar.r, bar.g, bar.b);
  });

  // Current price — red vertical line
  if (currentPrice > 0) {
    const cpx = vx(currentPrice);
    vline(cpx, PAD_TOP - 2, H - PAD_BOT + 4, 210, 30, 30, 3);
  }

  // Build PNG
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(W, 0);
  ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
  const ihdr = pngChunk("IHDR", ihdrData);

  const scanlines = Buffer.allocUnsafe(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    scanlines[y * (1 + W * 3)] = 0; // filter = None
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 3;
      const dst = y * (1 + W * 3) + 1 + x * 3;
      scanlines[dst] = pixels[src];
      scanlines[dst + 1] = pixels[src + 1];
      scanlines[dst + 2] = pixels[src + 2];
    }
  }
  const idat = pngChunk("IDAT", deflateSync(scanlines));
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}
