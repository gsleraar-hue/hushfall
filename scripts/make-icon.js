// Maakt build/icon.png (256x256), build/icon.ico en public/icon.png zonder externe pakketten:
// een donker afgerond vierkant met een nevel van paars, koraal en blauw en een paar sterren.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 256;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Vaste sterren (x, y, straal in 256-pixels, sterkte) zodat elke grootte hetzelfde beeld geeft.
const STARS = [[0.23, 0.24, 1.6, 0.8], [0.77, 0.21, 1.2, 0.7], [0.84, 0.59, 1.8, 0.85], [0.17, 0.69, 1.3, 0.6], [0.66, 0.8, 1.5, 0.7], [0.38, 0.18, 1.0, 0.6], [0.32, 0.59, 1.4, 0.7], [0.46, 0.36, 1.2, 0.7], [0.55, 0.5, 3.2, 0.95]];
const BLOBS = [ // cx, cy, rx, ry, hoek, kleur, sterkte
  [0.42, 0.5, 0.38, 0.28, -0.38, [157, 123, 255], 0.95],
  [0.62, 0.42, 0.3, 0.22, 0.31, [239, 139, 102], 0.85],
  [0.5, 0.66, 0.33, 0.18, 0, [108, 180, 255], 0.7],
];
const towards = (col, c, a) => [col[0] + (c[0] - col[0]) * a, col[1] + (c[1] - col[1]) * a, col[2] + (c[2] - col[2]) * a];
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const R = size * 0.22; const scale = size / 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const dx = Math.max(R - x, 0, x - (size - 1 - R)), dy = Math.max(R - y, 0, y - (size - 1 - R));
    const d = Math.sqrt(dx * dx + dy * dy) - R;
    const alpha = Math.max(0, Math.min(1, 0.5 - d));
    if (alpha <= 0) continue;
    const u = x / size, v = y / size;
    const rad = Math.hypot(u - 0.5, v - 0.5) * 1.4;
    let col = [28 - 12 * rad, 21 - 8 * rad, 38 - 18 * rad];
    for (const [cx, cy, rx, ry, ang, c, k] of BLOBS) {
      const px0 = u - cx, py0 = v - cy;
      const xr = px0 * Math.cos(ang) - py0 * Math.sin(ang), yr = px0 * Math.sin(ang) + py0 * Math.cos(ang);
      col = towards(col, c, Math.exp(-((xr / rx) ** 2 + (yr / ry) ** 2) * 2.2) * k);
    }
    for (const [sx, sy, sr, so] of STARS) {
      const dist = Math.hypot((u - sx) * size, (v - sy) * size) / scale;
      if (dist < sr + 1) col = towards(col, [244, 235, 221], so * Math.max(0, Math.min(1, sr + 0.5 - dist)));
    }
    const bx = (u - 0.55) * 256, by = (v - 0.5) * 256; // kruisje bij de grote ster
    if ((Math.abs(bx) < 0.7 && Math.abs(by) < 12) || (Math.abs(by) < 0.7 && Math.abs(bx) < 12)) col = towards(col, [244, 235, 221], 0.7 * (1 - Math.max(Math.abs(bx), Math.abs(by)) / 12));
    px[i] = Math.round(Math.max(0, Math.min(255, col[0]))); px[i + 1] = Math.round(Math.max(0, Math.min(255, col[1]))); px[i + 2] = Math.round(Math.max(0, Math.min(255, col[2]))); px[i + 3] = Math.round(alpha * 255);
  }
  return px;
}
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), png(SIZE, SIZE, render(SIZE)));
const sizes = [256, 64, 48, 32, 16];
const pngs = sizes.map((s) => png(s, s, render(s)));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
const dir = []; let offset = 6 + 16 * sizes.length;
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e[2] = 0; e[3] = 0; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length; dir.push(e);
});
fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), Buffer.concat([header, ...dir, ...pngs]));
fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(ROOT, 'public', 'icon.png'));
console.log('build/icon.png, build/icon.ico en public/icon.png gemaakt');
