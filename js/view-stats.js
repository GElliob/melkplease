// Statistiques : 24 dernières heures et 7 derniers jours.

import { fmtDuration, shortDay } from './format.js';
import { computeStats } from './stats.js';

const card = (label, value) => `<div class="card"><span class="card-label">${label}</span><span class="card-value">${value}</span></div>`;
const orDash = (ms) => (ms == null ? '–' : fmtDuration(ms));

function sideSplit(sides) {
  const total = sides.G + sides.D;
  if (!total) return '';
  const g = Math.round((sides.G / total) * 100);
  return `
    <div class="split">
      <div class="split-bar"><span class="side-G" style="width:${g}%"></span><span class="side-D" style="width:${100 - g}%"></span></div>
      <div class="split-legend"><span>Gauche ${g} % · ${fmtDuration(sides.G)}</span><span>Droit ${100 - g} % · ${fmtDuration(sides.D)}</span></div>
    </div>`;
}

function weekBars(days) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const bars = days.map((d) => `
    <div class="bar-col">
      <span class="bar-count">${d.count || ''}</span>
      <span class="bar ${d.count ? "" : "empty"}" style="height:${Math.round((d.count / max) * 100)}%"></span>
      <span class="bar-day">${shortDay(d.from)}</span>
      <span class="bar-total">${d.totalMs ? fmtDuration(d.totalMs).replace(' min', '′') : ''}</span>
    </div>`).join('');
  return `<div class="bars">${bars}</div>`;
}

export function renderStats(root, state, now) {
  const s = computeStats(state.feeds, now);
  root.innerHTML = `
    <div class="stats">
      <h3>24 dernières heures</h3>
      <div class="cards">
        ${card('Tétées', s.count)}
        ${card('Temps total', fmtDuration(s.totalMs))}
        ${card('Intervalle moyen', orDash(s.avgInterval))}
        ${card('Plus long intervalle', orDash(s.maxInterval))}
        ${card('Durée moyenne', orDash(s.avgDuration))}
      </div>
      ${sideSplit(s.sides)}
      <h3>7 derniers jours</h3>
      ${weekBars(s.days)}
      <p class="hint">Intervalles comptés d’un début de tétée au suivant.</p>
    </div>`;
}
