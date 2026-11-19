// Liaison avec le serveur : ordres reçus par Siri, état en cours, notifications.
// L'historique reste sur le téléphone ; le serveur ne voit que l'état en cours,
// les ordres en attente et l'heure des prochains rappels.

import { SERVER_CANAL, SERVER_URL } from './config.js';
import { startOfDay } from './format.js';
import { buildEvent } from './tracking-model.js';

const TIMEOUT_MS = 8000;

export class ServerError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(code, path, { method = 'GET', body } = {}) {
  if (!code) throw new ServerError('Code d’accès non renseigné (Réglages).', 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SERVER_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${code}`,
        ...(SERVER_CANAL ? { 'X-Melk-Canal': SERVER_CANAL } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = response.headers.get('Content-Type')?.includes('json') ? await response.json() : await response.text();
    if (response.status === 401) throw new ServerError('Code d’accès refusé par le serveur.', 401);
    if (!response.ok && response.status !== 409) throw new ServerError(`Serveur indisponible (${response.status}).`, response.status);
    return { status: response.status, data };
  } catch (err) {
    if (err instanceof ServerError) throw err;
    throw new ServerError(err?.name === 'AbortError' ? 'Le serveur ne répond pas.' : 'Pas de connexion au serveur.', 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transforme les ordres reçus en tétées et entrées de suivi.
 * Chaque ordre garde son identifiant : l'appliquer deux fois ne crée pas de doublon.
 */
export function applyEntries({ feeds, events }, entries) {
  const feedIds = new Set(feeds.map((f) => f.id));
  const eventIds = new Set(events.map((e) => e.id));
  return entries.reduce((acc, entry) => {
    if (entry.feed && !feedIds.has(entry.feed.id)) return { ...acc, feeds: [{ ...entry.feed, source: 'siri', score: null }, ...acc.feeds] };
    if (eventIds.has(entry.id)) return acc;
    try {
      if (entry.kind === 'event') return { ...acc, events: [buildEvent(entry.type, entry.at, entry.data, entry.id), ...acc.events] };
      if (entry.kind === 'sleep' && entry.slept) {
        return { ...acc, events: [buildEvent('sommeil', entry.slept.start, { end: entry.slept.end }, entry.id), ...acc.events] };
      }
    } catch (err) {
      console.error('[serveur] ordre ignoré', entry, err);
    }
    return acc;
  }, { feeds, events });
}

/** État que l'app transmet au serveur pour les rappels et pour Siri. */
export function liveSnapshot(state, now = Date.now()) {
  const vitd = state.events.find((e) => e.type === 'medic' && e.data.produit === 'vitd' && e.at >= startOfDay(now));
  const vitk = state.events.find((e) => e.type === 'medic' && e.data.produit === 'vitk');
  const s = state.settings;
  return {
    active: state.active,
    sleepActive: state.sleepActive,
    lastFeedStart: state.feeds[0]?.start ?? null,
    vitdDay: vitd ? parisDayKey(vitd.at) : null,
    vitkLast: vitk?.at ?? null,
    lastBackup: s.lastBackup ?? null,
    settings: {
      intervalMin: s.intervalMin, offsetMin: s.reminderOffsetMin, lateMin: s.lateAlertMin,
      vitdHour: s.vitdHour, quiet: s.quietNights, quietFrom: 23, quietTo: 6,
    },
  };
}

/** Jour au format du serveur (heure de Paris), ex. « 2026-11-19 ». */
export function parisDayKey(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export const pullPending = (code) => api(code, '/api/pending').then((r) => r.data);
export const ackEntries = (code, ids) => (ids.length ? api(code, '/api/ack', { method: 'POST', body: { ids } }) : Promise.resolve());
export const pushLive = (code, baseVersion, live) => api(code, '/api/live', { method: 'POST', body: { baseVersion, live } });
export const testPush = (code) => api(code, '/api/test-push', { method: 'POST' }).then((r) => r.data);

const urlBase64ToBytes = (value) => {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

/** Demande l'autorisation, abonne le téléphone et l'enregistre sur le serveur. */
export async function enableNotifications(code) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Notifications indisponibles ici : ouvre MelkPlease depuis son icône sur l’écran d’accueil.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées. Réglages iPhone > Notifications > MelkPlease pour les autoriser.');
  const { data } = await api(code, '/api/vapid');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(data.publicKey) });
  await api(code, '/api/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
}
