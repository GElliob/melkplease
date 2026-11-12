// Tests de l'indice de tétée (version bêta) : APP_DIR=../beta node --test tests/indice.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '../beta';
const { buildFeed, withScore, isValidFeed } = await import(`${DIR}/js/feeds.js`);
const { computeStats } = await import(`${DIR}/js/stats.js`);
const { buildCsv } = await import(`${DIR}/js/files.js`);

const M = 60000;
const T0 = new Date(2026, 10, 12, 8, 0).getTime();
const feed = (h, score) => buildFeed({ start: T0 + h * 60 * M, first: 'G', minutes: { G: 10, D: 0 }, score });

test('indice : bornes et copie sans mutation', () => {
  const f = feed(0);
  assert.equal(f.score, null);
  const noted = withScore(f, 4);
  assert.equal(noted.score, 4);
  assert.equal(f.score, null);
  assert.equal(withScore(noted, null).score, null);
  assert.throws(() => withScore(f, 6), /Indice invalide/);
  assert.throws(() => withScore(f, 2.5), /Indice invalide/);
  assert.throws(() => feed(0, -1), /Indice invalide/);
});

test('indice : anciennes tétées sans indice restent valides', () => {
  const { score, ...ancienne } = feed(0);
  assert.equal(isValidFeed(ancienne), true);
  assert.equal(isValidFeed({ ...ancienne, score: 9 }), false);
});

test('indice : moyenne sur 24 h, tétées non notées ignorées', () => {
  const feeds = [feed(0, 2), feed(3, 5), feed(6, null)].reverse();
  const s = computeStats(feeds, T0 + 8 * 60 * M);
  assert.equal(s.avgScore, 3.5);
  assert.equal(s.scoredCount, 2);
  assert.equal(computeStats([feed(0, null)], T0 + 60 * M).avgScore, null);
});

test('indice : export CSV', () => {
  assert.match(buildCsv([feed(0, 0)]), /"G";"0";""/);
  assert.match(buildCsv([feed(0, null)]), /"G";"";""/);
});
