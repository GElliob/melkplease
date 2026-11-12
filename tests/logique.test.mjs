import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '..';
const { tapSide, elapsed, finishActive } = await import(`${DIR}/js/chrono.js`);
const { buildFeed, suggestNextSide, sideDurations, sideOrder } = await import(`${DIR}/js/feeds.js`);
const { parseNotes, withoutDuplicates } = await import(`${DIR}/js/import-notes.js`);
const { computeStats } = await import(`${DIR}/js/stats.js`);
const { mergeBackup, buildBackup } = await import(`${DIR}/js/store.js`);
const { buildCsv } = await import(`${DIR}/js/files.js`);

const M = 60000;
const T0 = new Date(2026, 10, 11, 14, 0).getTime();

test('chrono : démarrer, changer, pause, reprendre, terminer', () => {
  let a = tapSide(null, 'G', T0);
  a = tapSide(a, 'D', T0 + 10 * M);          // passe à droite
  a = tapSide(a, 'D', T0 + 15 * M);          // pause
  assert.equal(a.current, null);
  a = tapSide(a, 'D', T0 + 20 * M);          // reprend à droite
  const e = elapsed(a, T0 + 23 * M);
  assert.equal(e.G, 10 * M); assert.equal(e.D, 8 * M);
  const f = finishActive(a, T0 + 23 * M);
  assert.deepEqual(sideOrder(f), ['G', 'D']);
  assert.equal(f.start, T0);
});

test('chrono : pause puis reprise sur l’autre sein', () => {
  let a = tapSide(null, 'G', T0);
  a = tapSide(a, 'G', T0 + 5 * M);
  a = tapSide(a, 'D', T0 + 7 * M);
  assert.equal(a.current.side, 'D');
  assert.equal(elapsed(a, T0 + 9 * M).total, 7 * M);
});

test('chrono : tétée vide non enregistrée', () => {
  assert.equal(finishActive(tapSide(null, 'G', T0), T0 + 200), null);
});

test('sein conseillé', () => {
  const both = buildFeed({ start: T0, first: 'G', minutes: { G: 10, D: 5 } });
  assert.equal(suggestNextSide([both]).side, 'D');
  const one = buildFeed({ start: T0, first: 'G', minutes: { G: 10, D: 0 } });
  assert.equal(suggestNextSide([one]).side, 'D');
  const oneD = buildFeed({ start: T0, first: 'D', minutes: { G: 0, D: 12 } });
  assert.equal(suggestNextSide([oneD]).side, 'G');
  assert.equal(suggestNextSide([]).side, 'G');
});

test('saisie : validations', () => {
  assert.throws(() => buildFeed({ start: T0, first: 'G', minutes: { G: 0, D: 0 } }), /au moins une durée/);
  assert.throws(() => buildFeed({ start: T0, first: 'G', minutes: { G: 500, D: 0 } }), /invalide/);
  const f = buildFeed({ start: T0, first: 'D', minutes: { G: 4, D: 6 } });
  assert.deepEqual(sideDurations(f), { G: 4 * M, D: 6 * M });
  assert.deepEqual(sideOrder(f), ['D', 'G']);
});

test('import Notes : formats variés', () => {
  const text = `10/11
  7h30 G 12 min D 8 min
  10:45 droite 15'
  mardi 11 novembre
  2h G+D 20mn
  3h15 gauche
  café avec maman
  14h30`;
  const now = new Date(2026, 10, 11, 18, 0).getTime();
  const { feeds, skipped } = parseNotes(text, now, now);
  assert.equal(feeds.length, 4);
  const [a, b, c, d] = feeds;
  assert.equal(new Date(a.start).getDate(), 10);
  assert.equal(new Date(a.start).getHours(), 7);
  assert.deepEqual(sideDurations(a), { G: 12 * M, D: 8 * M });
  assert.deepEqual(sideDurations(b), { G: 0, D: 15 * M });
  assert.equal(new Date(c.start).getDate(), 11);
  assert.equal(sideDurations(c).G + sideDurations(c).D, 20 * M);
  assert.equal(d.durationUnknown, true);
  assert.deepEqual(skipped, ['café avec maman', '14h30']);
  assert.equal(withoutDuplicates(feeds, [a]).length, 3);
});

test('stats 24 h', () => {
  const now = T0 + 8 * 60 * M;
  const feeds = [0, 3, 6].map((h) => buildFeed({ start: T0 + h * 60 * M, first: 'G', minutes: { G: 10, D: 10 } })).reverse();
  const s = computeStats(feeds, now);
  assert.equal(s.count, 3);
  assert.equal(s.avgInterval, 180 * M);
  assert.equal(s.totalMs, 60 * M);
  assert.equal(s.days.at(-1).count, 3);
});

test('sauvegarde : fusion sans doublon, rejet des fichiers étrangers', () => {
  const f = buildFeed({ start: T0, first: 'G', minutes: { G: 10, D: 0 } });
  const g = buildFeed({ start: T0 + 3 * 60 * M, first: 'D', minutes: { G: 0, D: 10 } });
  const r = mergeBackup([f], buildBackup([f, g], {}));
  assert.equal(r.added, 1); assert.equal(r.feeds.length, 2);
  assert.throws(() => mergeBackup([], { app: 'autre', feeds: [] }), /pas une sauvegarde/);
});

test('csv', () => {
  const f = buildFeed({ start: T0, first: 'G', minutes: { G: 10, D: 5 }, note: 'tête "molle"' });
  const csv = buildCsv([f]);
  assert.match(csv, /"2026-11-11";"14:00";"10";"5";"15";"G puis D";(?:"";)?"tête ""molle"""/);
});
