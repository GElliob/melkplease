// Stockage sur le téléphone (localStorage de l'app installée) et sauvegardes.

import { isValidFeed, sortFeeds } from './feeds.js';
import { STORAGE_PREFIX } from './config.js';
import { isValidEvent, sortEvents } from './tracking-model.js';

const KEYS = Object.freeze({
  feeds: `${STORAGE_PREFIX}.feeds.v1`,
  active: `${STORAGE_PREFIX}.active.v1`,
  settings: `${STORAGE_PREFIX}.settings.v1`,
  events: `${STORAGE_PREFIX}.events.v1`,
});

export const DEFAULT_SETTINGS = Object.freeze({ intervalMin: 180, theme: 'auto', lastBackup: null, birth: null });
export const BACKUP_APP = 'melkplease';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`[store] lecture impossible : ${key}`, err);
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[store] écriture impossible : ${key}`, err);
    throw new Error("Impossible d'enregistrer sur ce téléphone (stockage plein ?).");
  }
}

export const loadFeeds = () => sortFeeds(read(KEYS.feeds, []).filter(isValidFeed));
export const loadActive = () => read(KEYS.active, null);
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });

export function saveFeeds(feeds) {
  const sorted = sortFeeds(feeds);
  write(KEYS.feeds, sorted);
  return sorted;
}

export const saveActive = (active) => write(KEYS.active, active);

export const loadEvents = () => sortEvents(read(KEYS.events, []).filter(isValidEvent));

export function saveEvents(events) {
  const sorted = sortEvents(events);
  write(KEYS.events, sorted);
  return sorted;
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
  return settings;
}

/** Demande à iOS de ne pas purger les données (sans effet si refusé). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch (err) {
    console.warn('[store] persistance refusée', err);
  }
}

export function buildBackup(feeds, settings, events = []) {
  return { app: BACKUP_APP, version: 2, exportedAt: new Date().toISOString(), feeds, settings, events };
}

const mergeById = (current, incoming) => {
  const known = new Set(current.map((x) => x.id));
  return incoming.filter((x) => !known.has(x.id));
};

/**
 * Fusionne une sauvegarde : ce qui est déjà présent (même id) est gardé tel quel.
 * Les sauvegardes version 1 (tétées seules) restent acceptées.
 */
export function mergeBackup(currentFeeds, backup, currentEvents = []) {
  if (!backup || backup.app !== BACKUP_APP || !Array.isArray(backup.feeds)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de MelkPlease.");
  }
  const valid = backup.feeds.filter(isValidFeed);
  const added = mergeById(currentFeeds, valid);
  const incomingEvents = Array.isArray(backup.events) ? backup.events : [];
  const validEvents = incomingEvents.filter(isValidEvent);
  const addedEvents = mergeById(currentEvents, validEvents);
  return {
    feeds: sortFeeds([...currentFeeds, ...added]),
    events: sortEvents([...currentEvents, ...addedEvents]),
    added: added.length,
    eventsAdded: addedEvents.length,
    ignored: backup.feeds.length - valid.length + incomingEvents.length - validEvents.length,
  };
}
