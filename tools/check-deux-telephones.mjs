// Recette : deux téléphones (deux Chrome séparés) sur la bêta en ligne, même serveur.
// Vérifie que l'historique, les réglages communs et les saisies Siri arrivent des deux côtés.
// Usage : MELK_CODE=… node tools/check-deux-telephones.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CODE = process.env.MELK_CODE;
if (!CODE) throw new Error('MELK_CODE absent de l’environnement.');
const APP = 'https://gelliob.github.io/melkplease/beta/';
const SERVER = 'https://melkplease-serveur.melkplease-serveur.workers.dev';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok) => results.push(`${ok ? 'OK ' : 'KO '} ${label}`);

async function phone(port) {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'melk-tel-'))}`,
    `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 40 && !targets.length; i += 1) {
    await sleep(250);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => []);
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve) => { seq += 1; pending.set(seq, resolve); ws.send(JSON.stringify({ id: seq, method, params })); });
  const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Runtime.enable');
  await send('Page.navigate', { url: APP });
  await sleep(1500);
  return {
    errors, run,
    reload: async (wait = 5000) => { await send('Page.reload'); await sleep(wait); },
    read: (key) => run(`JSON.parse(localStorage.getItem('melkplease-beta.${key}') ?? 'null')`),
    close: () => { ws.close(); proc.kill(); },
  };
}

const tag = `t${Date.now()}`;
const now = Date.now();
const A = await phone(9371);
const B = await phone(9372);

// Téléphone A : celui de la maman, avec un historique et la date de naissance.
await A.run(`(() => {
  localStorage.clear();
  const M = 60000, now = ${now};
  const feeds = [0, 1, 2].map((i) => ({ id: '${tag}-f' + i, start: now - (i + 1) * 3 * 60 * M, end: now - (i + 1) * 3 * 60 * M + 15 * M,
    segments: [{ side: 'G', start: now - (i + 1) * 3 * 60 * M, end: now - (i + 1) * 3 * 60 * M + 15 * M }], note: '', source: 'test', score: 3 }));
  localStorage.setItem('melkplease-beta.feeds.v1', JSON.stringify(feeds));
  localStorage.setItem('melkplease-beta.settings.v1', JSON.stringify({ theme: 'nuit', serverCode: ${JSON.stringify(CODE)}, birth: ${now - 10 * 86400000}, intervalMin: 165 }));
})()`);
await A.reload(6000);

// Téléphone B : celui du papa, vide, juste le code.
await B.run(`localStorage.clear(); localStorage.setItem('melkplease-beta.settings.v1', JSON.stringify({ theme: 'jour', serverCode: ${JSON.stringify(CODE)} }))`);
await B.reload(6000);
const bFeeds = (await B.read('feeds.v1')) ?? [];
const bSettings = await B.read('settings.v1');
check('B reçoit les 3 tétées de A', [0, 1, 2].every((i) => bFeeds.some((f) => f.id === `${tag}-f${i}`)));
check('B reçoit la date de naissance et l’écart de A', bSettings.birth === now - 10 * 86400000 && bSettings.intervalMin === 165);
check('B garde son propre thème', bSettings.theme === 'jour');

// B note une couche depuis l'accueil, A doit la voir.
await B.run(`document.querySelector('[data-action="quick"][data-tool="couche"][data-quick="1"]').click()`);
await sleep(4000);
await A.reload(6000);
const aEvents = (await A.read('events.v1')) ?? [];
check('A voit la couche notée sur B', aEvents.some((e) => e.type === 'couche' && e.data.kind === 'selles' && e.at > now));

// A supprime une tétée, B ne doit plus l'avoir.
await A.run(`document.querySelector('[data-tab="home"]').click()`);
await sleep(300);
await A.run(`document.querySelector('[data-action="open-journal"]').click()`);
await sleep(300);
await A.run(`window.confirm = () => true; document.querySelector('[data-action="edit"][data-id="${tag}-f2"]').click()`);
await sleep(400);
await A.run(`document.querySelector('[data-delete]').click()`);
await sleep(4000);
await B.reload(6000);
check('suppression faite sur A répercutée sur B', !((await B.read('feeds.v1')) ?? []).some((f) => f.id === `${tag}-f2`));

// Siri : une saisie vocale arrive sur les deux téléphones.
const reply = await fetch(`${SERVER}/api/voice`, { method: 'POST', headers: { Authorization: `Bearer ${CODE}`, 'X-Melk-Canal': 'beta', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'pipi' }) }).then((r) => r.text());
await A.reload(6000);
await B.reload(6000);
const siriA = ((await A.read('events.v1')) ?? []).filter((e) => e.type === 'couche' && e.data.kind === 'pipi' && e.at > now).length;
const siriB = ((await B.read('events.v1')) ?? []).filter((e) => e.type === 'couche' && e.data.kind === 'pipi' && e.at > now).length;
check(`Siri (« ${reply} ») arrive sur A et sur B, sans doublon`, siriA === 1 && siriB === 1);

console.log(results.join('\n'));
const errors = [...A.errors, ...B.errors];
console.log(errors.length ? `ERREURS :\n${errors.join('\n')}` : 'Aucune erreur console.');
A.close();
B.close();
process.exit(results.some((r) => r.startsWith('KO')) || errors.length ? 1 : 0);
