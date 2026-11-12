// Onglet « Aujourd'hui » : l'essentiel de la journée de Céleste en un coup d'œil.
// Pas de boutons G / D ici : la tétée se lance depuis son propre onglet.

import { DAY, SIDE_AT, escapeHtml, fmtAgo, fmtClock, fmtDuration, fmtTimer } from './format.js';
import { nextFeedAt, suggestNextSide } from './feeds.js';
import { elapsed } from './chrono.js';
import { describeEvent } from './tracking-model.js';
import {
  ageLabel, diapersLast24h, feedsLast24h, nextAppointment, previousWeekWindow,
  sleepMsBetween, sleepStatus, timelineSegments, vitaminDToday, weekSummary, weightTrend,
} from './today.js';

const fmtScore = (n) => (n == null ? '–' : `${n.toFixed(1).replace('.', ',')}`);
/** Écart entre deux pesées : en jours dès 24 h. */
const fmtSpan = (ms) => (ms >= DAY ? `${Math.round(ms / DAY)} j` : fmtDuration(ms));
const fmtPerDay = (n) => n.toFixed(1).replace('.', ',').replace(',0', '');

function timelineHtml(list, now) {
  const bar = (s) => {
    const width = Math.max(0.6, (s.to - s.from) * 100);
    return `<span class="tl-seg tl-${s.kind}" style="left:${(s.from * 100).toFixed(2)}%;width:${width.toFixed(2)}%"></span>`;
  };
  const labels = [now - DAY, now - DAY / 2, now].map((t) => `<span>${fmtClock(t)}</span>`).join('');
  return `<div class="timeline" aria-hidden="true"><div class="tl-track">${list.map(bar).join('')}</div>
    <div class="tl-labels">${labels}</div></div>`;
}

function feedCard(state, now, segs) {
  const { active, feeds, settings } = state;
  const day = feedsLast24h(feeds, now);
  const last = feeds[0];
  const { side } = suggestNextSide(feeds);
  const head = active
    ? `<p class="dash-live">Tétée en cours ${active.current ? SIDE_AT[active.current.side] : '(pause)'}</p>
       <p class="dash-big" data-tick="dash-feed">${fmtTimer(elapsed(active, now).total)}</p>`
    : last
      ? `<p class="dash-live">Début de la dernière tétée</p>
         <p class="dash-big" data-tick="dash-ago">${fmtAgo(now - last.start)}</p>
         <p class="dash-sub">Prochaine vers ${fmtClock(nextFeedAt(feeds, settings.intervalMin))} · commencer ${SIDE_AT[side]}</p>`
      : '<p class="dash-sub">Aucune tétée enregistrée.</p>';
  return `
    <button class="dash-card" data-action="goto-tab" data-tab="home">
      <span class="dash-title">Tétées</span>
      ${head}
      <span class="dash-stats"><b>${day.count}</b> en 24 h · ${fmtDuration(day.totalMs)} · indice ${fmtScore(day.avgScore)}</span>
      ${timelineHtml(segs.feeds, now)}
    </button>`;
}

function sleepCard(state, now, segs) {
  const status = sleepStatus(state.events, state.sleepActive, now);
  const total = sleepMsBetween(state.events, now - DAY, now, state.sleepActive);
  const head = status.asleep
    ? `<p class="dash-live">Elle dort depuis</p><p class="dash-big" data-tick="dash-sleep">${fmtTimer(now - status.since)}</p>`
    : status.since
      ? `<p class="dash-live">Réveillée depuis</p><p class="dash-big" data-tick="dash-awake">${fmtDuration(now - status.since)}</p>`
      : '<p class="dash-sub">Aucun sommeil noté.</p>';
  return `
    <section class="dash-card">
      <span class="dash-title">Sommeil</span>
      ${head}
      <span class="dash-stats"><b>${fmtDuration(total)}</b> de sommeil en 24 h</span>
      ${timelineHtml(segs.sleep, now)}
      <div class="dash-actions">
        ${status.asleep
          ? '<button class="quick-btn accent" data-action="sleep-stop">Réveillée</button>'
          : '<button class="quick-btn" data-action="sleep-start">Elle dort</button>'}
        <button class="quick-btn add-inline" data-action="add-event" data-tool="sommeil">Après coup</button>
      </div>
    </section>`;
}

function diaperCard(state, now) {
  const d = diapersLast24h(state.events, now);
  return `
    <section class="dash-card">
      <span class="dash-title">Couches</span>
      <span class="dash-stats"><b>${d.pipi}</b> pipi · <b>${d.selles}</b> selles en 24 h</span>
      <div class="dash-actions">
        <button class="quick-btn" data-action="quick" data-tool="couche" data-quick="0">Pipi</button>
        <button class="quick-btn" data-action="quick" data-tool="couche" data-quick="1">Selles</button>
        <button class="quick-btn" data-action="quick" data-tool="couche" data-quick="2">Les deux</button>
      </div>
    </section>`;
}

function smallCards(state, now) {
  const vitd = vitaminDToday(state.events, now);
  const weight = weightTrend(state.events);
  const rdv = nextAppointment(state.events, now);
  const delta = weight?.deltaG != null
    ? ` · ${weight.deltaG >= 0 ? '+' : ''}${weight.deltaG.toLocaleString('fr-FR')} g en ${fmtSpan(weight.sinceMs)}`
    : '';
  return `
    <div class="dash-row">
      ${vitd
        ? `<section class="dash-card small done"><span class="dash-title">Vitamine D</span><span class="dash-stats">Donnée à ${fmtClock(vitd.at)}</span></section>`
        : `<button class="dash-card small todo" data-action="quick" data-tool="medic" data-quick="0"><span class="dash-title">Vitamine D</span><span class="dash-stats">À donner · toucher quand c’est fait</span></button>`}
      <button class="dash-card small" data-action="goto-tool" data-tool="croissance">
        <span class="dash-title">Poids</span>
        <span class="dash-stats">${weight ? `<b>${weight.last.data.poids.toLocaleString('fr-FR')} g</b>${delta}` : 'Aucune pesée'}</span>
      </button>
    </div>
    ${rdv ? `<button class="dash-card" data-action="goto-tool" data-tool="rdv"><span class="dash-title">Prochain rendez-vous</span>
      <span class="dash-stats">${escapeHtml(describeEvent(rdv))} · ${new Date(rdv.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${fmtClock(rdv.at)}</span></button>` : ''}`;
}

/** Bloc « semaine » partagé avec l'écran Stats. */
export function weekHtml(w) {
  if (!w.hasData) return '<p class="dash-sub">Pas encore assez de données.</p>';
  const total = w.sides.G + w.sides.D;
  const g = total ? Math.round((w.sides.G / total) * 100) : null;
  const items = [
    ['Tétées par jour', fmtPerDay(w.feedsPerDay)],
    ['Durée moyenne', w.avgDuration == null ? '–' : fmtDuration(w.avgDuration)],
    ['Indice moyen', fmtScore(w.avgScore)],
    ['Gauche / droit', g == null ? '–' : `${g} % / ${100 - g} %`],
    ['Sommeil par jour', fmtDuration(w.sleepPerDay)],
    ['Couches par jour', `${fmtPerDay(w.pipiPerDay)} pipi · ${fmtPerDay(w.sellesPerDay)} selles`],
    ['Poids', w.weightGainG == null ? '–' : `${w.weightGainG >= 0 ? '+' : ''}${w.weightGainG.toLocaleString('fr-FR')} g`],
  ];
  return `<dl class="week">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function weekCard(state, now) {
  if (new Date(now).getDay() !== 1) return '';
  const { from, to } = previousWeekWindow(now);
  const w = weekSummary(state.feeds, state.events, from, to);
  if (!w.hasData) return '';
  return `<section class="dash-card week-card"><span class="dash-title">La semaine de Céleste</span>${weekHtml(w)}</section>`;
}

export function renderToday(root, state, now) {
  const segs = timelineSegments(state.feeds, state.events, state.sleepActive, now);
  const age = ageLabel(state.settings.birth, now);
  const date = new Date(now).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  root.innerHTML = `
    <div class="today">
      <header class="today-head"><h1>Céleste</h1><p>${age ? `${age} · ` : ''}${date}</p></header>
      ${weekCard(state, now)}
      ${feedCard(state, now, segs)}
      ${sleepCard(state, now, segs)}
      ${diaperCard(state, now)}
      ${smallCards(state, now)}
    </div>`;
}

/** Mise à jour à la seconde des seuls chiffres en direct. */
export function tickToday(root, state, now) {
  const set = (key, text) => {
    const el = root.querySelector(`[data-tick="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };
  if (state.active) set('dash-feed', fmtTimer(elapsed(state.active, now).total));
  else if (state.feeds[0]) set('dash-ago', fmtAgo(now - state.feeds[0].start));
  const status = sleepStatus(state.events, state.sleepActive, now);
  if (status.asleep) set('dash-sleep', fmtTimer(now - status.since));
  else if (status.since) set('dash-awake', fmtDuration(now - status.since));
}
