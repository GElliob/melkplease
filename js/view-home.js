// Écran principal, inspiré des meilleurs trackers d'allaitement : deux gros
// boutons ronds Gauche / Droit en bas (zone du pouce), chacun avec son chrono.
// Toucher un sein démarre, change de côté, met en pause ou reprend. Les boutons
// ne changent jamais de place, que la tétée soit en cours ou non.

import { DAY, SIDE_AT, SIDE_LABEL, fmtAgo, fmtClock, fmtDuration, fmtTimer } from './format.js';
import { nextFeedAt, sideOrder, suggestNextSide, totalDuration } from './feeds.js';
import { currentSide, elapsed } from './chrono.js';

const BACKUP_EVERY = 7 * DAY;

function lastFeedSummary(feed) {
  const order = sideOrder(feed).join(' puis ');
  const duration = feed.durationUnknown ? 'durée non notée' : fmtDuration(totalDuration(feed));
  return `${fmtClock(feed.start)} · ${duration} · ${order}`;
}

function backupBanner(state, now) {
  const { feeds, settings } = state;
  if (feeds.length < 5) return '';
  if (settings.lastBackup && now - settings.lastBackup < BACKUP_EVERY) return '';
  return '<button class="banner" data-action="goto-settings">Pense à faire une sauvegarde (Réglages)</button>';
}

function headerHtml(state, now) {
  const { active, feeds } = state;
  if (active) {
    const side = currentSide(active);
    const label = active.current ? `En cours ${SIDE_AT[side]}` : 'En pause';
    return `
      <p class="label">${label} · depuis ${fmtClock(active.startedAt)}</p>
      <p class="timer" data-tick="total">${fmtTimer(elapsed(active, now).total)}</p>
      <p class="sub">${active.current ? 'Touche l’autre sein pour changer, le même pour une pause.' : 'Touche un sein pour reprendre.'}</p>`;
  }
  const last = feeds[0];
  if (!last) return '<p class="label">Aucune tétée enregistrée</p><p class="sub">Touche un sein pour lancer le chrono.</p>';
  return `
    <p class="label">Début de la dernière tétée</p>
    <p class="big" data-tick="ago">${fmtAgo(now - last.start)}</p>
    <p class="sub">${lastFeedSummary(last)}</p>
    <p class="next" data-tick="next"></p>`;
}

function sideButton(side, state, now, suggested) {
  const { active } = state;
  const running = active?.current?.side === side;
  const paused = active && !active.current && active.pausedSide === side;
  const time = active ? fmtTimer(elapsed(active, now)[side]) : '';
  const hint = running ? 'pause' : paused ? 'reprendre' : active ? 'passer ici' : side === suggested ? 'conseillé' : '';
  const classes = ['side-btn', `side-${side}`, running && 'running', paused && 'paused', !active && side === suggested && 'suggested']
    .filter(Boolean).join(' ');
  return `
    <button class="${classes}" data-action="tap-side" data-side="${side}" aria-label="${SIDE_LABEL[side]}">
      <span class="ring"></span>
      <span class="letter">${side}</span>
      <span class="side-time" data-tick="${side}">${time}</span>
      <span class="side-hint">${hint}</span>
    </button>`;
}

function footerHtml(state) {
  if (state.active) {
    return `
      <button class="btn-finish" data-action="finish">Terminer</button>
      <button class="link-btn danger" data-action="discard">Annuler cette tétée</button>`;
  }
  return '<button class="link-btn" data-action="manual">Saisir une tétée passée</button>';
}

export function renderHome(root, state, now) {
  const { side, reason } = suggestNextSide(state.feeds);
  const suggest = state.active
    ? ''
    : `<p class="suggest">Commencer <strong>${SIDE_AT[side]}</strong>${reason ? `<small>${reason}</small>` : ''}</p>`;
  root.innerHTML = `
    <section class="home ${state.active ? 'is-active' : 'is-idle'}">
      ${backupBanner(state, now)}
      <div class="summary">${headerHtml(state, now)}</div>
      <div class="thumb-zone">
        ${suggest}
        <div class="sides">${sideButton('G', state, now, side)}${sideButton('D', state, now, side)}</div>
        ${footerHtml(state)}
      </div>
    </section>`;
  tickHome(root, state, now);
}

/** Mise à jour chaque seconde des seuls textes qui bougent (aucun bouton recréé sous le doigt). */
export function tickHome(root, state, now) {
  const set = (key, text) => {
    const el = root.querySelector(`[data-tick="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };
  if (state.active) {
    const e = elapsed(state.active, now);
    set('total', fmtTimer(e.total));
    set('G', fmtTimer(e.G));
    set('D', fmtTimer(e.D));
    return;
  }
  const last = state.feeds[0];
  if (!last) return;
  set('ago', fmtAgo(now - last.start));
  const next = nextFeedAt(state.feeds, state.settings.intervalMin);
  const nextEl = root.querySelector('[data-tick="next"]');
  if (nextEl) {
    const late = now > next;
    nextEl.classList.toggle('late', late);
    set('next', late ? `Prochaine prévue à ${fmtClock(next)} (dépassée)` : `Prochaine vers ${fmtClock(next)}`);
  }
}
