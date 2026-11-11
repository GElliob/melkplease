// Stockage sur le téléphone (localStorage de l'app installée) et sauvegardes.

import { isValidFeed, sortFeeds } from './feeds.js';

const KEYS = Object.freeze({
  feeds: 'melkplease.feeds.v1',
  active: 'melkplease.active.v1',
  settings: 'melkplease.settings.v1',
});

export const DEFAULT_SETTINGS = Object.freeze({ intervalMin: 180, theme: 'auto', lastBackup: null });
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

export function buildBackup(feeds, settings) {
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), feeds, settings };
}

/** Fusionne une sauvegarde : les tétées déjà présentes (même id) sont gardées telles quelles. */
export function mergeBackup(currentFeeds, backup) {
  if (!backup || backup.app !== BACKUP_APP || !Array.isArray(backup.feeds)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de MelkPlease.");
  }
  const valid = backup.feeds.filter(isValidFeed);
  const known = new Set(currentFeeds.map((f) => f.id));
  const added = valid.filter((f) => !known.has(f.id));
  return { feeds: sortFeeds([...currentFeeds, ...added]), added: added.length, ignored: backup.feeds.length - valid.length };
}
