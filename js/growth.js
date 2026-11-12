// Courbe de croissance : mesures de Céleste sur les courbes OMS (filles).

import { DAY } from './format.js';
import { WHO_GIRLS } from './growth-data.js';

const MONTH = 30.4375 * DAY;
const W = 340;
const H = 220;
const PAD = Object.freeze({ l: 34, r: 10, t: 12, b: 26 });

export const METRICS = Object.freeze([
  { key: 'poids', label: 'Poids', unit: 'kg', toUnit: (g) => g / 1000 },
  { key: 'taille', label: 'Taille', unit: 'cm', toUnit: (v) => v },
  { key: 'crane', label: 'Crâne', unit: 'cm', toUnit: (v) => v },
]);

/** Valeur OMS interpolée entre deux mois révolus. */
function whoAt(table, month, column) {
  const i = Math.min(Math.floor(month), table.length - 2);
  const t = month - i;
  return table[i][column] * (1 - t) + table[i + 1][column] * t;
}

function niceSteps(min, max) {
  const span = max - min;
  const step = span > 20 ? 5 : span > 8 ? 2 : span > 3 ? 1 : 0.5;
  const first = Math.ceil(min / step) * step;
  return Array.from({ length: Math.floor((max - first) / step) + 1 }, (_, i) => +(first + i * step).toFixed(2));
}

/**
 * @param {object[]} events  mesures (type croissance), plus récentes d'abord
 * @param {number|null} birth  naissance (ms)
 * @param {string} metricKey
 * @returns {string} SVG ou message
 */
export function growthChartHtml(events, birth, metricKey) {
  const metric = METRICS.find((m) => m.key === metricKey);
  if (!birth) return '<p class="hint">Indique la date de naissance dans les Réglages pour voir la courbe.</p>';
  const points = events
    .filter((e) => e.data[metric.key] !== undefined && e.at >= birth)
    .map((e) => ({ m: (e.at - birth) / MONTH, v: metric.toUnit(e.data[metric.key]) }))
    .filter((p) => p.m <= 24);
  const table = WHO_GIRLS[metric.key];
  const maxMonth = Math.min(24, Math.max(3, Math.ceil(Math.max(0, ...points.map((p) => p.m)) + 1)));
  const samples = Array.from({ length: maxMonth * 4 + 1 }, (_, i) => i / 4);
  const values = [...samples.flatMap((m) => [whoAt(table, m, 1), whoAt(table, m, 3)]), ...points.map((p) => p.v)];
  const yMin = Math.min(...values) * 0.97;
  const yMax = Math.max(...values) * 1.02;
  const x = (m) => PAD.l + (m / maxMonth) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - ((v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const line = (col) => samples.map((m, i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)},${y(whoAt(table, m, col)).toFixed(1)}`).join(' ');
  const band = `${line(1)} ${[...samples].reverse().map((m) => `L${x(m).toFixed(1)},${y(whoAt(table, m, 3)).toFixed(1)}`).join(' ')} Z`;
  const yTicks = niceSteps(yMin, yMax).map((v) =>
    `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="g-grid"/><text x="${PAD.l - 6}" y="${y(v) + 4}" class="g-axis" text-anchor="end">${String(v).replace('.', ',')}</text>`).join('');
  const xStep = maxMonth > 12 ? 3 : maxMonth > 6 ? 2 : 1;
  const xTicks = Array.from({ length: Math.floor(maxMonth / xStep) + 1 }, (_, i) => i * xStep)
    .map((m) => `<text x="${x(m)}" y="${H - 8}" class="g-axis" text-anchor="middle">${m}</text>`).join('');
  const sorted = [...points].sort((a, b) => a.m - b.m);
  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = sorted.map((p) => `<circle cx="${x(p.m)}" cy="${y(p.v)}" r="4.5" class="g-dot"/>`).join('');

  return `
    <figure class="growth">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric.label} de Céleste sur les courbes OMS">
        ${yTicks}${xTicks}
        <path d="${band}" class="g-band"/>
        <path d="${line(2)}" class="g-median"/>
        ${path ? `<path d="${path}" class="g-line"/>` : ''}${dots}
      </svg>
      <figcaption>${metric.label} (${metric.unit}) selon l’âge en mois. Zone : courbes OMS filles, de −2 à +2 écarts-types ; trait : médiane.
        ${points.length ? '' : ' Aucune mesure pour l’instant.'}</figcaption>
    </figure>`;
}
