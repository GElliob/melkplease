// Génère les icônes PNG, sans dépendance : une goutte de lait avec, en son cœur,
// l'étoile de Céleste (quatre branches douces), sur le fond nuit de l'app.
// Usage : node tools/make-icons.mjs <dossier de sortie> [taille d'aperçu → fichier apercu.png]

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [OUT, PREVIEW] = process.argv.slice(2);
if (!OUT) throw new Error('Usage : node tools/make-icons.mjs <dossier de sortie> [taille aperçu]');

const BG = [21, 18, 16]; // fond nuit (#151210)
const DROP = [236, 220, 201]; // goutte crème
const STAR = [240, 138, 85]; // étoile abricot (couleur d'action de l'app)
const SAMPLES = 4;

// Goutte : un cercle prolongé par un cône jusqu'à la pointe (tangentes exactes).
const C = Object.freeze({ x: 0.5, y: 0.585, r: 0.27 });
const APEX_Y = 0.13;
const D = C.y - APEX_Y;
const TAN = C.r / Math.sqrt(D * D - C.r * C.r);
const TANGENT_Y = APEX_Y + (D * D - C.r * C.r) / D;

function inDrop(x, y) {
  if ((x - C.x) ** 2 + (y - C.y) ** 2 <= C.r ** 2) return true;
  return y >= APEX_Y && y <= TANGENT_Y && Math.abs(x - C.x) <= (y - APEX_Y) * TAN;
}

// Étoile à quatre branches arrondies (superellipse concave), au centre du cercle.
// Branches verticales un peu plus longues : lecture « étoile » plutôt que « losange ».
const STAR_C = Object.freeze({ x: 0.5, y: 0.6, ax: 0.13, ay: 0.175, p: 0.62 });
const inStar = (x, y) => (Math.abs(x - STAR_C.x) / STAR_C.ax) ** STAR_C.p + (Math.abs(y - STAR_C.y) / STAR_C.ay) ** STAR_C.p <= 1;

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

/** Couleur d'un pixel, lissée par suréchantillonnage. */
function pixel(px, py, size) {
  const acc = [0, 0, 0];
  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const x = (px + (sx + 0.5) / SAMPLES) / size;
      const y = (py + (sy + 0.5) / SAMPLES) / size;
      const color = inStar(x, y) ? STAR : inDrop(x, y) ? DROP : BG;
      color.forEach((v, i) => { acc[i] += v; });
    }
  }
  return acc.map((v) => Math.round(v / SAMPLES ** 2));
}

function render(size) {
  const row = size * 3 + 1;
  const raw = Buffer.alloc(size * row);
  for (let py = 0; py < size; py += 1) {
    raw[py * row] = 0;
    for (let px = 0; px < size; px += 1) raw.set(pixel(px, py, size), py * row + 1 + px * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
[180, 192, 512].forEach((size) => writeFileSync(join(OUT, `icon-${size}.png`), render(size)));
if (PREVIEW) writeFileSync(join(OUT, 'apercu.png'), render(Number(PREVIEW)));
console.log(`Icônes écrites dans ${OUT}`);
