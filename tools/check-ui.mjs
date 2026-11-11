// Recette visuelle : sert l'app, l'ouvre dans Chrome sans interface au format
// iPhone, joue un scénario de tétée et enregistre des captures + erreurs console.
// Usage : node tools/check-ui.mjs [url]   (sans url : copie locale)

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'tools', 'captures');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 4791;
const CDP_PORT = 9341;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(ROOT, path || 'index.html');
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(HTTP_PORT);

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'melk-'))}`, `--remote-debugging-port=${CDP_PORT}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 40 && !targets.length; i += 1) {
  await sleep(250);
  targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((r) => r.json()).catch(() => []);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((resolve) => {
  seq += 1;
  pending.set(seq, resolve);
  ws.send(JSON.stringify({ id: seq, method, params }));
});
const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

mkdirSync(SHOTS, { recursive: true });
const shot = async (name) => {
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, 'base64'));
  console.log(`capture ${name}`);
};
const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: process.argv[2] ?? `http://127.0.0.1:${HTTP_PORT}/` });
await sleep(1200);
await run(`localStorage.setItem('melkplease.settings.v1', JSON.stringify({ theme: 'nuit' }))`);
await send('Page.reload');
await sleep(1000);
await shot('1-accueil-vide');

await click('[data-action="tap-side"][data-side="G"]');
await sleep(2200);
await click('[data-action="tap-side"][data-side="D"]');
await sleep(1200);
await shot('2-tetee-en-cours');
await click('[data-action="finish"]');
await sleep(500);
await shot('3-terminee-toast');

await click('[data-action="manual"]');
await sleep(400);
await shot('4-saisie-passee');
await run(`document.querySelector('.feed-form input[name="start"]').value = '2026-11-11T07:30'`);
await click('.feed-form button[type="submit"]');
await sleep(400);

await click('[data-tab="journal"]');
await sleep(300);
await shot('5-journal');
await click('[data-tab="stats"]');
await sleep(300);
await shot('6-stats');
await click('[data-tab="settings"]');
await sleep(300);
await run(`document.querySelector('textarea[name="import-text"]').value = '10/11\\n7h30 G 12 min D 8 min\\n10h45 droite 15\\'\\nbla bla'`);
await click('[data-action="import-preview"]');
await sleep(300);
await shot('7-import');
await run(`localStorage.setItem('melkplease.settings.v1', JSON.stringify({ theme: 'jour' }))`);
await send('Page.reload');
await sleep(900);
await shot('8-accueil-jour');

console.log(errors.length ? `ERREURS :\n${errors.join('\n')}` : 'Aucune erreur console.');
ws.close();
chrome.kill();
server.close();
process.exit(errors.length ? 1 : 0);
