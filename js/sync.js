// Synchronisation avec le serveur : à l'ouverture, toutes les 30 s quand l'app
// est à l'écran, et après chaque changement de l'état en cours.
// Règle : si Siri a agi depuis la dernière synchro, l'état du serveur l'emporte ;
// sinon le changement fait sur le téléphone est transmis.

import { STORAGE_PREFIX } from './config.js';
import { ackEntries, applyEntries, liveSnapshot, pullPending, pushLive, syncItemsApi } from './server.js';
import { applyRemote, buildChanges, clearSent, initialOutbox, loadOutbox, saveOutbox } from './items-sync.js';

const KEY = `${STORAGE_PREFIX}.sync.v1`;
const POLL_MS = 30_000;
const DEBOUNCE_MS = 1500;
const BATCH = 400;

const readMeta = () => {
  try {
    return { version: null, dirty: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { version: null, dirty: false };
  }
};
const writeMeta = (meta) => localStorage.setItem(KEY, JSON.stringify(meta));

/**
 * @param {{ getState:()=>object, adopt:(patch:object)=>void, onStatus:(s:object)=>void, onReceived:(n:number)=>void }} deps
 */
export function createSync({ getState, adopt, onStatus, onReceived }) {
  let meta = readMeta();
  let running = null;
  let timer = null;

  const code = () => getState().settings.serverCode;
  const save = (patch) => {
    meta = { ...meta, ...patch };
    writeMeta(meta);
  };

  async function push(baseVersion) {
    const { status, data } = await pushLive(code(), baseVersion, liveSnapshot(getState()));
    if (status === 409) return { conflict: true };
    save({ version: data.version, dirty: false });
    return { conflict: false };
  }

  async function syncOnce() {
    const pending = await pullPending(code());
    const serverMoved = meta.version !== pending.live.version;
    const state = getState();
    const merged = applyEntries({ feeds: state.feeds, events: state.events }, pending.entries);
    // Première synchro : le téléphone fait foi (une tétée en cours ne doit pas être effacée).
    const keepLocal = meta.version === null || (meta.dirty && !serverMoved);
    const remoteLive = { active: pending.live.active ?? null, sleepActive: pending.live.sleepActive ?? null };
    const liveDiffers = !keepLocal
      && JSON.stringify(remoteLive) !== JSON.stringify({ active: state.active ?? null, sleepActive: state.sleepActive ?? null });
    // On ne redessine l'écran que si quelque chose a vraiment changé.
    if (pending.entries.length || liveDiffers) adopt({ ...merged, ...(keepLocal ? {} : remoteLive) });
    if (pending.entries.length) onReceived(pending.entries.length);
    await ackEntries(code(), pending.entries.map((e) => e.id));
    return push(pending.live.version);
  }

  /** Historique partagé : envoie la boîte d'envoi, reçoit ce que l'autre téléphone (ou Siri) a changé. */
  async function syncHistory() {
    if (meta.itemsSeq == null) saveOutbox({ ...initialOutbox(getState()), ...loadOutbox() });
    const changes = buildChanges(loadOutbox(), getState());
    const batches = changes.length ? Array.from({ length: Math.ceil(changes.length / BATCH) }, (_, i) => changes.slice(i * BATCH, (i + 1) * BATCH)) : [[]];
    let since = meta.itemsSeq ?? 0;
    let more = true;
    for (let i = 0; i < batches.length || more; i += 1) {
      const res = await syncItemsApi(code(), since, batches[i] ?? []);
      const patch = applyRemote(getState(), loadOutbox(), res.changes);
      if (patch) adopt(patch);
      if (batches[i]?.length) saveOutbox(clearSent(loadOutbox(), batches[i]));
      since = res.seq;
      more = res.more;
      save({ itemsSeq: since });
    }
  }

  async function syncNow() {
    if (!code()) return;
    if (running) return running;
    running = (async () => {
      try {
        const first = await syncOnce();
        if (first.conflict) await syncOnce();
        await syncHistory();
        onStatus({ ok: true, at: Date.now() });
      } catch (err) {
        console.warn('[synchro]', err);
        onStatus({ ok: false, at: Date.now(), error: err.message });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** Un changement local à transmettre (regroupé sur 1,5 s). */
  function markChanged() {
    if (!code()) return;
    save({ dirty: true });
    clearTimeout(timer);
    timer = setTimeout(syncNow, DEBOUNCE_MS);
  }

  function start() {
    syncNow();
    setInterval(() => {
      if (document.visibilityState === 'visible') syncNow();
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
  }

  return { start, syncNow, markChanged };
}
