// MelkPlease : suivi des tétées de Céleste. Point d'entrée : état, navigation, actions.

import { SIDE_AT, dayKey, fmtClock, fmtDuration } from './format.js';
import { nextFeedAt, suggestNextSide, totalDuration, withScore } from './feeds.js';
import { openScoreSheet } from './score.js';
import { finishActive, tapSide } from './chrono.js';
import {
  buildBackup, loadActive, loadEvents, loadFeeds, loadSettings, loadSleepActive, mergeBackup,
  requestPersistence, saveActive, saveEvents, saveFeeds, saveSettings, saveSleepActive,
} from './store.js';
import { buildCsv, buildEventsCsv, openReminder, shareOrDownload } from './files.js';
import { suiviHandlers } from './suivi-actions.js';
import { renderSuivi } from './view-suivi.js';
import { renderToday, tickToday } from './view-today.js';
import { buildEvent } from './tracking-model.js';
import { openFeedForm } from './feed-form.js';
import { showError, showToast } from './ui.js';
import { renderHome, tickHome } from './view-home.js';
import { renderJournal } from './view-journal.js';
import { renderStats } from './view-stats.js';
import { renderSettings } from './view-settings.js';

const BABY_NAME = 'Céleste';
const NIGHT = Object.freeze({ from: 19, to: 8 });

let state = Object.freeze({
  tab: 'today', journalDays: 7, tool: null, growthMetric: 'poids',
  feeds: loadFeeds(), active: loadActive(), settings: loadSettings(), events: loadEvents(), sleepActive: loadSleepActive(),
});
let wakeLock = null;

const view = () => document.getElementById('view');

function setState(patch) {
  state = Object.freeze({ ...state, ...patch });
  render();
}

/* ---------- Persistance ---------- */

function commitFeeds(feeds) {
  setState({ feeds: saveFeeds(feeds) });
}

function commitEvents(events) {
  setState({ events: saveEvents(events) });
}

function commitActive(active) {
  saveActive(active);
  setState({ active });
  syncWakeLock();
}

function updateSettings(patch) {
  setState({ settings: saveSettings({ ...state.settings, ...patch }) });
}

/* ---------- Tétée en cours ---------- */

function onTapSide(side) {
  commitActive(tapSide(state.active, side, Date.now()));
}

function onFinish() {
  const feed = finishActive(state.active, Date.now());
  commitActive(null);
  if (!feed) {
    showToast('Tétée trop courte, rien d’enregistré.');
    return;
  }
  // Enregistrée tout de suite : rien n'est perdu si l'indice n'est pas donné.
  commitFeeds([feed, ...state.feeds]);
  const duration = fmtDuration(totalDuration(feed));
  openScoreSheet({
    summary: `${fmtClock(feed.start)} · ${duration}`,
    onPick: (score) => {
      commitFeeds(state.feeds.map((f) => (f.id === feed.id ? withScore(f, score) : f)));
      confirmFinished(feed, `${duration} · indice ${score}`);
    },
    onSkip: () => confirmFinished(feed, duration),
  });
}

function confirmFinished(feed, detail) {
  const next = nextFeedAt(state.feeds, state.settings.intervalMin);
  showToast(`Enregistrée · ${detail}`, [
    { label: 'Annuler', run: () => commitFeeds(state.feeds.filter((f) => f.id !== feed.id)) },
    { label: `Rappel ${fmtClock(next)}`, run: () => remind(next) },
  ], 9000);
}

function onDiscard() {
  if (window.confirm('Annuler cette tétée sans l’enregistrer ?')) commitActive(null);
}

/* ---------- Sommeil chronométré ---------- */

const MIN_SLEEP_MS = 60 * 1000;

function onSleepStart() {
  const sleepActive = { start: Date.now() };
  saveSleepActive(sleepActive);
  setState({ sleepActive });
}

function onSleepStop() {
  const { sleepActive } = state;
  if (!sleepActive) return;
  const now = Date.now();
  saveSleepActive(null);
  setState({ sleepActive: null });
  if (now - sleepActive.start < MIN_SLEEP_MS) {
    showToast('Moins d’une minute : rien d’enregistré.');
    return;
  }
  const event = buildEvent('sommeil', sleepActive.start, { end: now });
  commitEvents([event, ...state.events]);
  showToast(`Sommeil enregistré · ${fmtDuration(now - sleepActive.start)}`, [
    { label: 'Annuler', run: () => commitEvents(state.events.filter((e) => e.id !== event.id)) },
  ], 8000);
}

/* ---------- Saisie et modification ---------- */

function upsertFeed(feed) {
  commitFeeds([feed, ...state.feeds.filter((f) => f.id !== feed.id)]);
  showToast('Tétée enregistrée.');
}

function openForm(feed) {
  openFeedForm({
    feed,
    suggested: suggestNextSide(state.feeds).side,
    now: Date.now(),
    onSave: upsertFeed,
    onDelete: (id) => {
      const removed = state.feeds.find((f) => f.id === id);
      commitFeeds(state.feeds.filter((f) => f.id !== id));
      showToast('Tétée supprimée.', [{ label: 'Annuler', run: () => commitFeeds([removed, ...state.feeds]) }]);
    },
  });
}

/* ---------- Fichiers ---------- */

function remind(at) {
  const { side } = suggestNextSide(state.feeds);
  openReminder(at, `Tétée ${BABY_NAME} · commencer ${SIDE_AT[side]}`);
}

async function backup() {
  const json = JSON.stringify(buildBackup(state.feeds, state.settings, state.events), null, 2);
  const done = await shareOrDownload(json, `melkplease-${dayKey(Date.now())}.json`, 'application/json');
  if (done) {
    updateSettings({ lastBackup: Date.now() });
    showToast('Sauvegarde prête.');
  }
}

async function restore(file) {
  const backupData = JSON.parse(await file.text());
  const { feeds, events, added, eventsAdded, ignored } = mergeBackup(state.feeds, backupData, state.events);
  commitFeeds(feeds);
  commitEvents(events);
  showToast(`${added} tétée(s) et ${eventsAdded} entrée(s) de suivi ajoutée(s)${ignored ? `, ${ignored} illisible(s)` : ''}.`);
}

function importFeeds(feeds) {
  commitFeeds([...feeds, ...state.feeds]);
  showToast(`${feeds.length} tétée(s) importée(s).`);
  setState({ tab: 'journal' });
}

const settingsActions = Object.freeze({
  updateSettings,
  importFeeds: safe(importFeeds),
  backup: safe(backup),
  csv: safe(() => shareOrDownload(buildCsv(state.feeds), `melkplease-${dayKey(Date.now())}.csv`, 'text/csv')),
  csvSuivi: safe(() => shareOrDownload(buildEventsCsv(state.events), `melkplease-suivi-${dayKey(Date.now())}.csv`, 'text/csv')),
  restore: safe(restore),
  reminder: safe(() => remind(nextFeedAt(state.feeds, state.settings.intervalMin))),
});

/** Toute action passe par ici : une erreur s'affiche au lieu de disparaître. */
function safe(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      showError(err);
    }
  };
}

/* ---------- Rendu ---------- */

function applyTheme() {
  const hour = new Date().getHours();
  const auto = hour >= NIGHT.from || hour < NIGHT.to ? 'nuit' : 'jour';
  const theme = state.settings.theme === 'auto' ? auto : state.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'nuit' ? '#151210' : '#f7f3ee');
}

function render() {
  const now = Date.now();
  applyTheme();
  const tabOn = state.tab === 'journal' ? 'home' : state.tab;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tabOn));
  document.body.classList.toggle('feeding', Boolean(state.active));
  document.body.dataset.tab = state.tab;
  const root = view();
  if (state.tab === 'today') renderToday(root, state, now);
  else if (state.tab === 'home') renderHome(root, state, now);
  else if (state.tab === 'journal') renderJournal(root, state, now, state.journalDays);
  else if (state.tab === 'suivi') renderSuivi(root, state, now);
  else if (state.tab === 'stats') renderStats(root, state, now);
  else renderSettings(root, state, now, settingsActions);
}

const handlers = Object.freeze({
  'tap-side': (el) => onTapSide(el.dataset.side),
  finish: onFinish,
  discard: onDiscard,
  manual: () => openForm(null),
  edit: (el) => openForm(state.feeds.find((f) => f.id === el.dataset.id)),
  'more-days': (el) => setState({ journalDays: Number(el.dataset.days) }),
  'goto-settings': () => setState({ tab: 'settings' }),
  'goto-tab': (el) => setState({ tab: el.dataset.tab, tool: null }),
  'goto-tool': (el) => setState({ tab: 'suivi', tool: el.dataset.tool }),
  'open-journal': () => setState({ tab: 'journal' }),
  'sleep-start': onSleepStart,
  'sleep-stop': onSleepStop,
  ...suiviHandlers({ getState: () => state, setState, commitEvents, safe }),
});

function bindEvents() {
  view().addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    const handler = el && handlers[el.dataset.action];
    if (handler) safe(handler)(el);
  });
  document.querySelectorAll('.tabs [data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => setState({ tab: btn.dataset.tab, tool: null })));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setState({ feeds: loadFeeds(), active: loadActive(), events: loadEvents(), sleepActive: loadSleepActive() });
      syncWakeLock();
    }
  });
}

/* ---------- Écran allumé pendant la tétée ---------- */

async function syncWakeLock() {
  try {
    if (state.active && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!state.active && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (err) {
    console.warn('[app] écran allumé indisponible', err);
  }
}

function start() {
  bindEvents();
  render();
  syncWakeLock();
  requestPersistence();
  setInterval(() => {
    if (state.tab === 'home') tickHome(view(), state, Date.now());
    else if (state.tab === 'today') tickToday(view(), state, Date.now());
  }, 1000);
  setInterval(applyTheme, 60 * 1000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('[app] mode hors ligne indisponible', err));
  }
}

start();
