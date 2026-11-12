// Tests des outils de suivi (version bêta) : node --test tests/suivi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const DIR = process.env.APP_DIR ?? '../beta';
const { buildEvent, describeEvent, summarize, isValidEvent } = await import(`${DIR}/js/tracking-model.js`);
const { TOOLS } = await import(`${DIR}/js/tracking-defs.js`);
const { mergeBackup, buildBackup } = await import(`${DIR}/js/store.js`);
const { buildEventsCsv } = await import(`${DIR}/js/files.js`);
const { WHO_GIRLS } = await import(`${DIR}/js/growth-data.js`);
const { growthChartHtml } = await import(`${DIR}/js/growth.js`);

const M = 60000; const H = 60 * M;
const NOW = Date.now();

test('neuf outils, clés uniques, boutons rapides valides', () => {
  assert.equal(TOOLS.length, 9);
  assert.equal(new Set(TOOLS.map((t) => t.key)).size, 9);
  TOOLS.forEach((t) => (t.quick ?? []).forEach((q) => assert.ok(isValidEvent(buildEvent(t.key, NOW, q.data)))));
});

test('couches : champs conditionnels et résumé 24 h', () => {
  const pipi = buildEvent('couche', NOW - H, { kind: 'pipi', couleur: 'jaune' });
  assert.equal(pipi.data.couleur, undefined, 'couleur ignorée pour un pipi');
  const selles = buildEvent('couche', NOW - 2 * H, { kind: 'mixte', couleur: 'jaune', texture: 'grumeleuse' });
  assert.equal(describeEvent(selles), 'Les deux · Jaune · Grumeleuse');
  const vieux = buildEvent('couche', NOW - 30 * H, { kind: 'selles' });
  assert.equal(summarize('couche', [pipi, selles, vieux], NOW), '24 h : 2 pipi · 1 selles');
  assert.throws(() => buildEvent('couche', NOW, {}), /Contenu : à renseigner/);
  assert.throws(() => buildEvent('couche', NOW + 2 * H, { kind: 'pipi' }), /futur/);
});

test('sommeil : saisie après coup, bornes, total sur 24 h', () => {
  const s = buildEvent('sommeil', NOW - 3 * H, { end: NOW - H, lieu: 'lit' });
  assert.equal(describeEvent(s), '2 h 00 · Berceau / lit');
  const chevauche = buildEvent('sommeil', NOW - 25 * H, { end: NOW - 23 * H });
  assert.equal(summarize('sommeil', [s, chevauche], NOW), '24 h : 3 h 00 de sommeil');
  assert.throws(() => buildEvent('sommeil', NOW - H, { end: NOW - 2 * H }), /après/);
  assert.throws(() => buildEvent('sommeil', NOW - 30 * H, { end: NOW }), /24 h/);
  assert.throws(() => buildEvent('sommeil', NOW - H, {}), /Réveillée à : à renseigner/);
});

test('médicaments : vitamine D du jour, produit libre obligatoire', () => {
  assert.match(summarize('medic', [], NOW), /pas encore/);
  const d = buildEvent('medic', NOW, { produit: 'vitd' });
  assert.match(summarize('medic', [d], NOW), /^Vitamine D donnée à/);
  assert.throws(() => buildEvent('medic', NOW, { produit: 'autre' }), /Nom du produit/);
  assert.equal(describeEvent(buildEvent('medic', NOW, { produit: 'autre', nom: 'Sérum', dose: '1 dose' })), 'Sérum · 1 dose');
});

test('nombres : virgule, bornes, décimales', () => {
  const t = buildEvent('sante', NOW, { temp: '37,84', symptomes: [] });
  assert.equal(t.data.temp, 37.8);
  assert.equal(t.data.symptomes, undefined);
  assert.throws(() => buildEvent('sante', NOW, { temp: '50' }), /entre 34 et 43/);
  assert.throws(() => buildEvent('sante', NOW, {}), /au moins une valeur/);
  assert.throws(() => buildEvent('croissance', NOW, { poids: '3,2' }), /entre 1000 et 20000/);
  assert.equal(buildEvent('croissance', NOW, { poids: '3250' }).data.poids, 3250);
  assert.throws(() => buildEvent('biberon', NOW, { kind: 'bib_lm' }), /Quantité/);
});

test('rendez-vous : futur autorisé et prochain affiché', () => {
  const r = buildEvent('rdv', NOW + 48 * H, { kind: 'pediatre' });
  assert.match(summarize('rdv', [r], NOW), /^Prochain : Pédiatre/);
});

test('sauvegarde v2 : tétées et suivi fusionnés, v1 toujours acceptée', () => {
  const e = buildEvent('bain', NOW, {});
  const r = mergeBackup([], buildBackup([], {}, [e]), []);
  assert.equal(r.eventsAdded, 1);
  assert.equal(mergeBackup([], buildBackup([], {}, [e]), [e]).eventsAdded, 0);
  const v1 = { app: 'melkplease', version: 1, feeds: [] };
  assert.equal(mergeBackup([], v1, [e]).events.length, 1);
});

test('export CSV du suivi', () => {
  const csv = buildEventsCsv([buildEvent('couche', NOW, { kind: 'pipi', note: 'ok' })]);
  assert.match(csv, /"Couches";"Pipi";"ok"/);
});

test('courbes OMS : tables complètes et graphique', () => {
  ['poids', 'taille', 'crane'].forEach((k) => {
    assert.equal(WHO_GIRLS[k].length, 25);
    WHO_GIRLS[k].forEach(([, lo, med, hi]) => assert.ok(lo < med && med < hi));
  });
  assert.equal(WHO_GIRLS.poids[0][2], 3.232);
  const birth = NOW - 10 * 24 * H;
  const svg = growthChartHtml([buildEvent('croissance', NOW, { poids: '3400' })], birth, 'poids');
  assert.match(svg, /<svg/);
  assert.match(svg, /g-dot/);
  assert.match(growthChartHtml([], null, 'poids'), /date de naissance/);
});
