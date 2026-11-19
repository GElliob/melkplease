// Recette de bout en bout : app bêta en ligne + serveur réel (espace bêta).
// Le code d'accès est lu dans l'environnement (MELK_CODE), jamais affiché.
// Usage : MELK_CODE=… node tools/check-serveur.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = process.env.MELK_CODE;
if (!CODE) throw new Error('MELK_CODE absent de l’environnement.');
const APP = 'https://gelliob.github.io/melkplease/beta/';
const SERVER = 'https://melkplease-serveur.melkplease-serveur.workers.dev';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'captures-beta');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9361;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { Authorization: `Bearer ${CODE}`, 'X-Melk-Canal': 'beta', 'Content-Type': 'application/json' };
const server = (path, body) => fetch(`${SERVER}${path}`, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) })
  .then((r) => (r.headers.get('Content-Type')?.includes('json') ? r.json() : r.text()));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'melk-srv-'))}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
let targets = [];
for (let i = 0; i < 40 && !targets.length; i += 1) {
  await sleep(250);
  targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => []);
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
const read = (key) => run(`JSON.parse(localStorage.getItem('melkplease-beta.${key}') ?? 'null')`);
const results = [];
const check = (label, ok) => { results.push(`${ok ? 'OK ' : 'KO '} ${label}`); };

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: APP });
await sleep(1500);
// Départ propre : l'espace bêta du serveur est vidé de ses ordres en attente.
const before = await server('/api/pending');
await server('/api/ack', { ids: before.entries.map((e) => e.id) });
await run(`localStorage.clear(); localStorage.setItem('melkplease-beta.settings.v1', JSON.stringify({ theme: 'nuit', serverCode: ${JSON.stringify(CODE)} }))`);
await send('Page.reload');
await sleep(4000);

const replies = [];
for (const phrase of ['gauche', 'pipi', 'vitamine D']) replies.push(await server('/api/voice', { text: phrase }));
check(`réponses de Siri : ${replies.join(' | ')}`, replies[0].startsWith('Tétée à gauche'));
await send('Page.reload');
await sleep(4500);
const active = await read('active.v1');
const events = (await read('events.v1')) ?? [];
check('tétée lancée par Siri visible dans l’app', active?.current?.side === 'G');
check('pipi et vitamine D reçus', events.some((e) => e.type === 'couche') && events.some((e) => e.data?.produit === 'vitd'));
mkdirSync(SHOTS, { recursive: true });
const shot = async (name) => writeFileSync(join(SHOTS, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
await shot('20-siri-recu');

// Sens inverse : l'app change de sein, le serveur doit le savoir (pour « Dis Siri, fin »).
await run(`document.querySelector('[data-tab="home"]').click()`);
await sleep(300);
await run(`document.querySelector('[data-action="tap-side"][data-side="D"]').click()`);
await sleep(4000);
const live = await server('/api/pending');
check('changement fait dans l’app transmis au serveur', live.live.active?.current?.side === 'D');
const fin = await server('/api/voice', { text: 'fin' });
check(`« fin » dit à Siri : ${fin}`, /terminée|courte/.test(fin));
await send('Page.reload');
await sleep(4500);
const feeds = (await read('feeds.v1')) ?? [];
check('tétée terminée par Siri dans le journal', (await read('active.v1')) === null && (fin.includes('courte') || feeds.some((f) => f.source === 'siri')));
const left = await server('/api/pending');
check('ordres acquittés par l’app', left.entries.length === 0);

console.log(results.join('\n'));
console.log(errors.length ? `ERREURS :\n${errors.join('\n')}` : 'Aucune erreur console.');
ws.close();
chrome.kill();
process.exit(results.some((r) => r.startsWith('KO')) || errors.length ? 1 : 0);
