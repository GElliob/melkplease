// Liaison app ↔ serveur (bêta) : node --test tests/serveur-app.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '../beta';
const { applyEntries, liveSnapshot, parisDayKey } = await import(`${DIR}/js/server.js`);
const { buildEvent } = await import(`${DIR}/js/tracking-model.js`);
const { vitaminKStatus } = await import(`${DIR}/js/today.js`);

const M = 60_000;
const NOW = Date.now();

test('ordres Siri appliqués une seule fois', () => {
  const feed = { id: 'f1', start: NOW - 30 * M, end: NOW - 10 * M, segments: [{ side: 'G', start: NOW - 30 * M, end: NOW - 10 * M }], note: '', source: 'chrono' };
  const entries = [
    { id: 'e1', at: NOW - 30 * M, kind: 'live', active: { startedAt: NOW - 30 * M } },
    { id: 'e2', at: NOW - 10 * M, kind: 'live', active: null, feed },
    { id: 'e3', at: NOW - 5 * M, kind: 'event', type: 'couche', data: { kind: 'pipi' } },
    { id: 'e4', at: NOW - M, kind: 'sleep', sleepActive: null, slept: { start: NOW - 50 * M, end: NOW - M } },
    { id: 'e5', at: NOW, kind: 'event', type: 'couche', data: { kind: 'inconnu' } },
  ];
  const once = applyEntries({ feeds: [], events: [] }, entries);
  assert.equal(once.feeds.length, 1);
  assert.equal(once.feeds[0].source, 'siri');
  assert.equal(once.events.length, 2, 'ordre invalide ignoré');
  assert.deepEqual(once.events.map((e) => e.id).sort(), ['e3', 'e4']);
  const twice = applyEntries(once, entries);
  assert.equal(twice.feeds.length, 1);
  assert.equal(twice.events.length, 2);
});

test('état transmis au serveur', () => {
  const vitd = buildEvent('medic', NOW - M, { produit: 'vitd' });
  const vitk = buildEvent('medic', NOW - 2 * M, { produit: 'vitk' });
  const snap = liveSnapshot({
    active: null, sleepActive: { start: NOW - M }, feeds: [{ start: NOW - 60 * M }], events: [vitd, vitk],
    settings: { intervalMin: 150, reminderOffsetMin: 10, lateAlertMin: 60, vitdHour: 8, quietNights: true, lastBackup: null },
  }, NOW);
  assert.equal(snap.lastFeedStart, NOW - 60 * M);
  assert.equal(snap.vitdDay, parisDayKey(NOW));
  assert.equal(snap.vitkLast, NOW - 2 * M);
  assert.deepEqual(snap.settings, { intervalMin: 150, offsetMin: 10, lateMin: 60, vitdHour: 8, quiet: true, quietFrom: 23, quietTo: 6 });
  assert.match(parisDayKey(Date.UTC(2026, 10, 19, 23, 30)), /2026-11-20/);
});

test('vitamine K : prochaine dose le même jour du mois suivant', () => {
  const at = new Date(2026, 9, 31, 9).getTime(); // 31/10
  const s = vitaminKStatus([{ type: 'medic', at, data: { produit: 'vitk' } }], at + M);
  assert.equal(new Date(s.next).getDate(), 30, '31/10 → 30/11');
  assert.equal(s.due, false);
  assert.equal(vitaminKStatus([], NOW), null);
});
