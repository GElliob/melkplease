// Écran Suivi : une carte par outil (résumé + boutons d'un tap), puis l'écran
// de chaque outil avec son historique. Tout est séparé de l'écran tétées.

import { dayKey, dayLabel, escapeHtml, fmtClock } from './format.js';
import { TOOLS, TOOL_BY_KEY } from './tracking-defs.js';
import { describeEvent, summarize } from './tracking-model.js';
import { METRICS, growthChartHtml } from './growth.js';

function cardHtml(tool, events, now) {
  const quick = (tool.quick ?? [])
    .map((q, i) => `<button class="quick-btn" data-action="quick" data-tool="${tool.key}" data-quick="${i}">${q.label}</button>`).join('');
  return `
    <section class="tool-card">
      <div class="tool-top">
        <button class="tool-head" data-action="open-tool" data-tool="${tool.key}">
          <span class="tool-icon" aria-hidden="true">${tool.icon}</span>
          <span class="tool-text"><strong>${tool.name}</strong><small>${escapeHtml(summarize(tool.key, events, now))}</small></span>
        </button>
        <button class="add-round" data-action="add-event" data-tool="${tool.key}" aria-label="Ajouter : ${tool.name}">+</button>
      </div>
      ${quick ? `<div class="quick-row">${quick}</div>` : ''}
    </section>`;
}

function rowHtml(event) {
  const note = event.data.note ? `<span class="row-note">${escapeHtml(event.data.note)}</span>` : '';
  return `
    <button class="feed-row event-row" data-action="edit-event" data-id="${escapeHtml(event.id)}">
      <span class="time">${fmtClock(event.at)}</span>
      <span class="parts"><span class="event-desc">${escapeHtml(describeEvent(event))}</span>${note}</span>
    </button>`;
}

function historyHtml(list, now) {
  if (!list.length) return '<p class="empty">Rien de noté pour l’instant.</p>';
  const groups = list.reduce((acc, e) => {
    const key = dayKey(e.at);
    const last = acc.at(-1);
    return last?.key === key
      ? [...acc.slice(0, -1), { ...last, items: [...last.items, e] }]
      : [...acc, { key, ts: e.at, items: [e] }];
  }, []);
  return groups.map((g) => `
    <section class="day"><h3>${dayLabel(g.ts, now)}<small>${g.items.length}</small></h3>${g.items.map(rowHtml).join('')}</section>`).join('');
}

function toolScreenHtml(tool, state, now) {
  const list = state.events.filter((e) => e.type === tool.key);
  const upcoming = tool.allowFuture ? list.filter((e) => e.at > now).reverse() : [];
  const past = tool.allowFuture ? list.filter((e) => e.at <= now) : list;
  const metric = state.growthMetric ?? 'poids';
  const chart = tool.key === 'croissance'
    ? `<div class="seg metric-seg">${METRICS.map((m) =>
        `<button data-action="metric" data-metric="${m.key}" class="${m.key === metric ? 'on' : ''}">${m.label}</button>`).join('')}</div>
       ${growthChartHtml(list, state.settings.birth ?? null, metric)}`
    : '';
  const quick = (tool.quick ?? [])
    .map((q, i) => `<button class="quick-btn" data-action="quick" data-tool="${tool.key}" data-quick="${i}">${q.label}</button>`).join('');
  return `
    <div class="tool-screen">
      <button class="back-btn" data-action="close-tool">‹ Suivi</button>
      <h2>${tool.icon} ${tool.name}</h2>
      <p class="hint">${escapeHtml(summarize(tool.key, state.events, now))}</p>
      ${chart}
      ${upcoming.length ? `<h3 class="sub-title">À venir</h3>${upcoming.map(rowHtml).join('')}<h3 class="sub-title">Passés</h3>` : ''}
      ${historyHtml(past, now)}
      <div class="tool-actions">${quick}<button class="btn primary" data-action="add-event" data-tool="${tool.key}">Ajouter</button></div>
    </div>`;
}

export function renderSuivi(root, state, now) {
  const tool = state.tool && TOOL_BY_KEY[state.tool];
  root.innerHTML = tool
    ? toolScreenHtml(tool, state, now)
    : `<div class="suivi">${TOOLS.map((t) => cardHtml(t, state.events, now)).join('')}</div>`;
}
