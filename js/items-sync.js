// Historique partagé : ce que le téléphone envoie (boîte d'envoi) et ce qu'il reçoit.
// L'app ne modifie jamais un objet en place : une tétée changée est un nouvel objet,
// une tétée inchangée garde la même référence. Comparer les références suffit donc
// à savoir ce qui a été modifié.

import { STORAGE_PREFIX } from './config.js';
import { isValidFeed, sortFeeds } from './feeds.js';
import { isValidEvent, sortEvents } from './tracking-model.js';

const KEY = `${STORAGE_PREFIX}.outbox.v1`;
const SETTINGS_ID = 'settings';

/** Réglages communs aux deux téléphones (le thème, le code et la sauvegarde restent propres à chacun). */
export const SHARED_SETTINGS = Object.freeze(['birth', 'intervalMin', 'reminderOffsetMin', 'lateAlertMin', 'vitdHour', 'quietNights']);

export function loadOutbox() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch (err) {
    console.error('[synchro] boîte d’envoi illisible, repart à vide', err);
    return {};
  }
}

export const saveOutbox = (outbox) => localStorage.setItem(KEY, JSON.stringify(outbox));

/** Éléments ajoutés, modifiés ou supprimés entre deux versions d'une liste. */
export function diffChanges(prev, next, kind, now) {
  const before = new Set(prev);
  const nextIds = new Set(next.map((x) => x.id));
  return Object.fromEntries([
    ...next.filter((x) => !before.has(x)).map((x) => [x.id, { kind, deleted: false, updatedAt: now }]),
    ...prev.filter((x) => !nextIds.has(x.id)).map((x) => [x.id, { kind, deleted: true, updatedAt: now }]),
  ]);
}

export const settingsChange = (now) => ({ [SETTINGS_ID]: { kind: 'settings', deleted: false, updatedAt: now } });
export const touchesShared = (patch) => SHARED_SETTINGS.some((k) => k in patch);
const pickShared = (settings) => Object.fromEntries(SHARED_SETTINGS.filter((k) => k in settings).map((k) => [k, settings[k]]));

/**
 * Première synchro d'un téléphone : tout son historique part, daté « très ancien »
 * pour qu'une version déjà présente sur le serveur l'emporte.
 * Les réglages ne partent que s'ils sont renseignés (date de naissance).
 */
export function initialOutbox(state) {
  const old = 1;
  return Object.fromEntries([
    ...state.feeds.map((f) => [f.id, { kind: 'feed', deleted: false, updatedAt: old }]),
    ...state.events.map((e) => [e.id, { kind: 'event', deleted: false, updatedAt: old }]),
    ...(state.settings.birth ? [[SETTINGS_ID, { kind: 'settings', deleted: false, updatedAt: old }]] : []),
  ]);
}

/** Transforme la boîte d'envoi en modifications à transmettre. */
export function buildChanges(outbox, state) {
  const byId = new Map([...state.feeds, ...state.events].map((x) => [x.id, x]));
  return Object.entries(outbox).flatMap(([id, meta]) => {
    if (meta.deleted) return [{ id, kind: meta.kind, deleted: true, updatedAt: meta.updatedAt }];
    if (meta.kind === 'settings') return [{ id, kind: 'settings', deleted: false, updatedAt: meta.updatedAt, data: pickShared(state.settings) }];
    const data = byId.get(id);
    return data ? [{ id, kind: meta.kind, deleted: false, updatedAt: meta.updatedAt, data }] : [];
  });
}

/** Retire de la boîte d'envoi ce qui est parti et n'a pas été modifié depuis. */
export function clearSent(outbox, sent) {
  const sentAt = new Map(sent.map((c) => [c.id, c.updatedAt]));
  return Object.fromEntries(Object.entries(outbox).filter(([id, meta]) => !(sentAt.has(id) && sentAt.get(id) >= meta.updatedAt)));
}

const upsert = (list, item) => [item, ...list.filter((x) => x.id !== item.id)];

/**
 * Applique les modifications reçues. Une modification locale pas encore envoyée
 * et plus récente l'emporte. Renvoie null si rien ne change.
 */
export function applyRemote(state, outbox, changes) {
  const result = changes.reduce((acc, c) => {
    const local = outbox[c.id];
    // Strictement plus récente seulement : à égalité, la version du serveur s'impose partout (pas de divergence).
    if (local && local.updatedAt > c.updatedAt) return acc;
    if (c.kind === 'settings') return c.deleted || !c.data ? acc : { ...acc, settings: { ...acc.settings, ...pickShared(c.data) }, touched: true };
    const key = c.kind === 'feed' ? 'feeds' : 'events';
    if (c.deleted) {
      return acc[key].some((x) => x.id === c.id) ? { ...acc, [key]: acc[key].filter((x) => x.id !== c.id), touched: true } : acc;
    }
    const valid = c.kind === 'feed' ? isValidFeed(c.data) : isValidEvent(c.data);
    if (!valid) {
      console.warn('[synchro] élément reçu invalide, ignoré', c.id);
      return acc;
    }
    const current = acc[key].find((x) => x.id === c.id);
    if (current && JSON.stringify(current) === JSON.stringify(c.data)) return acc;
    return { ...acc, [key]: upsert(acc[key], Object.freeze(c.data)), touched: true };
  }, { feeds: state.feeds, events: state.events, settings: state.settings, touched: false });
  if (!result.touched) return null;
  return { feeds: sortFeeds(result.feeds), events: sortEvents(result.events), settings: result.settings };
}
