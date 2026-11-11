// Génère les icônes PNG (croissant de lune chaud sur fond nuit), sans dépendance.
// Usage : node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const BG = [12, 9, 7];
const MOON = [214, 150, 92];
const SAMPLES = 4;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Couverture du croissant au point (x, y) en coordonnées 0..1 */
function inMoon(x, y) {
  const outer = (x - 0.5) ** 2 + (y - 0.5) ** 2 < 0.3 ** 2;
  const bite = (x - 0.62) ** 2 + (y - 0.4) ** 2 < 0.25 ** 2;
  return outer && !bite;
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py += 1) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          if (inMoon((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)) hits += 1;
        }
      }
      const a = hits / SAMPLES ** 2;
      const offset = py * (size * 3 + 1) + 1 + px * 3;
      for (let c = 0; c < 3; c += 1) raw[offset + c] = Math.round(BG[c] * (1 - a) + MOON[c] * a);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
[180, 192, 512].forEach((size) => {
  writeFileSync(join(OUT, `icon-${size}.png`), render(size));
  console.log(`icon-${size}.png`);
});
