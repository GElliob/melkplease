// Historique partagé entre deux téléphones (bêta) : node --test tests/partage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '../beta';
const S = await import(`${DIR}/js/items-sync.js`);
const { buildFeed, withScore } = await import(`${DIR}/js/feeds.js`);
const { buildEvent } = await import(`${DIR}/js/tracking-model.js`);

const NOW = Date.now();
const M = 60_000;
const f1 = buildFeed({ start: NOW - 60 * M, first: 'G', minutes: { G: 10, D: 5 } });
const f2 = buildFeed({ start: NOW - 30 * M, first: 'D', minutes: { G: 0, D: 12 } });

test('changements détectés par référence (ajout, modification, suppression)', () => {
  const prev = [f2, f1];
  const noted = withScore(f1, 4);
  const next = [noted];
  const d = S.diffChanges(prev, next, 'feed', 123);
  assert.deepEqual(d[f1.id], { kind: 'feed', deleted: false, updatedAt: 123 });
  assert.deepEqual(d[f2.id], { kind: 'feed', deleted: true, updatedAt: 123 });
  assert.deepEqual(S.diffChanges(prev, prev, 'feed', 1), {}, 'rien changé');
});

test('envoi : contenu, réglages communs seulement, nettoyage après envoi', () => {
  const state = { feeds: [f1], events: [], settings: { birth: 5, theme: 'nuit', serverCode: 'secret', intervalMin: 150 } };
  const outbox = { [f1.id]: { kind: 'feed', deleted: false, updatedAt: 10 }, gone: { kind: 'event', deleted: true, updatedAt: 11 }, ...S.settingsChange(12) };
  const changes = S.buildChanges(outbox, state);
  assert.equal(changes.length, 3);
  const settings = changes.find((c) => c.kind === 'settings');
  assert.deepEqual(settings.data, { birth: 5, intervalMin: 150 }, 'ni thème ni code envoyés');
  const left = S.clearSent({ ...outbox, [f1.id]: { kind: 'feed', deleted: false, updatedAt: 99 } }, changes);
  assert.deepEqual(Object.keys(left), [f1.id], 'modifié pendant l’envoi : reste à envoyer');
});

test('réception : la modification la plus récente gagne', () => {
  const state = { feeds: [f1], events: [], settings: { theme: 'jour', birth: null } };
  const remoteScore = withScore(f1, 5);
  const vitd = buildEvent('medic', NOW, { produit: 'vitd' });
  const patch = S.applyRemote(state, {}, [
    { id: f1.id, kind: 'feed', updatedAt: 50, data: remoteScore },
    { id: f2.id, kind: 'feed', updatedAt: 50, data: f2 },
    { id: vitd.id, kind: 'event', updatedAt: 50, data: vitd },
    { id: 'settings', kind: 'settings', updatedAt: 50, data: { birth: 7, theme: 'nuit' } },
    { id: 'bad', kind: 'event', updatedAt: 50, data: { pirate: true } },
  ]);
  assert.equal(patch.feeds.length, 2);
  assert.equal(patch.feeds.find((f) => f.id === f1.id).score, 5);
  assert.equal(patch.events.length, 1, 'élément invalide ignoré');
  assert.deepEqual(patch.settings, { theme: 'jour', birth: 7 }, 'thème local conservé');
  const local = S.applyRemote(state, { [f1.id]: { kind: 'feed', updatedAt: 60 } }, [{ id: f1.id, kind: 'feed', updatedAt: 50, data: remoteScore }]);
  assert.equal(local, null, 'modif locale plus récente conservée');
  const del = S.applyRemote({ ...state, feeds: [f1, f2] }, {}, [{ id: f2.id, kind: 'feed', updatedAt: 70, deleted: true }]);
  assert.deepEqual(del.feeds.map((f) => f.id), [f1.id]);
  assert.equal(S.applyRemote(state, {}, [{ id: f1.id, kind: 'feed', updatedAt: 80, data: f1 }]), null, 'identique : rien à redessiner');
});

test('première synchro : tout l’historique part, daté très ancien', () => {
  const ev = buildEvent('couche', NOW, { kind: 'pipi' });
  const o = S.initialOutbox({ feeds: [f1], events: [ev], settings: { birth: null } });
  assert.deepEqual(Object.keys(o).sort(), [ev.id, f1.id].sort());
  assert.ok(Object.values(o).every((m) => m.updatedAt === 1));
  assert.ok('settings' in S.initialOutbox({ feeds: [], events: [], settings: { birth: 5 } }));
});
