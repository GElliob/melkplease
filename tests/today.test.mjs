// Tests du tableau de bord « Aujourd'hui » (bêta) : node --test tests/today.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '../beta';
const T = await import(`${DIR}/js/today.js`);
const { buildFeed } = await import(`${DIR}/js/feeds.js`);
const { buildEvent } = await import(`${DIR}/js/tracking-model.js`);

const M = 60000; const H = 60 * M; const D = 24 * H;
const NOW = new Date(2026, 10, 9, 10, 0).getTime(); // lundi 09/11/2026 10:00 (passé : la saisie refuse le futur)

test('âge lisible', () => {
  assert.equal(T.ageLabel(null, NOW), null);
  assert.equal(T.ageLabel(NOW - H, NOW), 'Née aujourd’hui');
  assert.equal(T.ageLabel(NOW - 3 * D, NOW), '3 jours');
  assert.equal(T.ageLabel(NOW - 40 * D, NOW), '5 semaines');
  assert.equal(T.ageLabel(new Date(2026, 6, 9).getTime(), NOW), '4 mois');
});

test('tétées sur 24 h glissantes et frise', () => {
  const f1 = buildFeed({ start: NOW - 2 * H, first: 'G', minutes: { G: 12, D: 6 }, score: 4 });
  const f2 = buildFeed({ start: NOW - 30 * H, first: 'D', minutes: { G: 0, D: 10 } });
  const r = T.feedsLast24h([f1, f2], NOW);
  assert.equal(r.count, 1); assert.equal(r.totalMs, 18 * M); assert.equal(r.avgScore, 4);
  const segs = T.timelineSegments([f1, f2], [], null, NOW);
  assert.equal(segs.feeds.length, 2);
  assert.deepEqual(segs.feeds.map((s) => s.kind), ['G', 'D']);
  assert.ok(segs.feeds.every((s) => s.from >= 0 && s.to <= 1 && s.from <= s.to));
});

test('sommeil : en direct, réveillée depuis, total sur 24 h', () => {
  const nap = buildEvent('sommeil', NOW - 5 * H, { end: NOW - 3 * H });
  assert.deepEqual(T.sleepStatus([nap], null, NOW), { asleep: false, since: NOW - 3 * H });
  assert.deepEqual(T.sleepStatus([nap], { start: NOW - H }, NOW), { asleep: true, since: NOW - H });
  assert.equal(T.sleepMsBetween([nap], NOW - D, NOW, { start: NOW - H }), 3 * H);
  assert.equal(T.sleepStatus([], null, NOW).since, null);
});

test('couches, vitamine D, poids, rendez-vous', () => {
  const ev = [
    buildEvent('couche', NOW - H, { kind: 'mixte' }),
    buildEvent('couche', NOW - 2 * H, { kind: 'pipi' }),
    buildEvent('medic', NOW - 3 * H, { produit: 'vitd' }),
    buildEvent('croissance', NOW - 4 * H, { poids: '3400' }),
    buildEvent('croissance', NOW - 4 * D, { poids: '3250' }),
  ];
  assert.deepEqual(T.diapersLast24h(ev, NOW), { pipi: 2, selles: 1 });
  assert.ok(T.vitaminDToday(ev, NOW));
  assert.equal(T.vitaminDToday(ev, NOW + D), null);
  const w = T.weightTrend(ev);
  assert.equal(w.deltaG, 150);
  const rdv = buildEvent('rdv', NOW + 2 * D, { kind: 'pmi' });
  assert.equal(T.nextAppointment([rdv, ...ev], NOW), rdv);
});

test('semaine écoulée : fenêtre lundi → lundi et résumé', () => {
  const { from, to } = T.previousWeekWindow(NOW);
  assert.equal(new Date(from).getDate(), 2);
  assert.equal(new Date(to).getDate(), 9);
  const feeds = Array.from({ length: 14 }, (_, i) => buildFeed({ start: from + i * 12 * H, first: 'G', minutes: { G: 10, D: 10 }, score: 3 })).reverse();
  const events = [buildEvent('croissance', from + 6 * D, { poids: '3500' }), buildEvent('croissance', from - D, { poids: '3200' })];
  const w = T.weekSummary(feeds, events, from, to);
  assert.equal(w.feedsPerDay, 2);
  assert.equal(w.avgDuration, 20 * M);
  assert.equal(w.avgScore, 3);
  assert.equal(w.weightGainG, 300);
  assert.equal(T.weekSummary([], [], from, to).hasData, false);
});
