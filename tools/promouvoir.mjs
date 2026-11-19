// Passe la bêta (beta/) dans l'app principale (racine), avec les réglages du canal principal :
// stockage « melkplease.* », caches « melkplease-v* », espace serveur principal, nom sans « bêta ».
// Usage : node tools/promouvoir.mjs <version affichée> <numéro de cache>
//   ex. node tools/promouvoir.mjs 2.1 4

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, cache] = process.argv.slice(2);
if (!version || !/^\d+$/.test(cache ?? '')) throw new Error('Usage : node tools/promouvoir.mjs <version> <numéro de cache>');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BETA = join(ROOT, 'beta');

function patch(file, replacements) {
  const path = join(ROOT, file);
  const next = replacements.reduce((text, [from, to]) => {
    if (!from.test(text)) throw new Error(`${file} : motif introuvable ${from}`);
    return text.replace(from, to);
  }, readFileSync(path, 'utf8'));
  writeFileSync(path, next);
}

rmSync(join(ROOT, 'js'), { recursive: true, force: true });
rmSync(join(ROOT, 'icons'), { recursive: true, force: true });
['js', 'icons', 'index.html', 'styles.css', 'manifest.webmanifest', 'sw.js']
  .forEach((item) => cpSync(join(BETA, item), join(ROOT, item), { recursive: true }));

patch('js/config.js', [
  [/export const STORAGE_PREFIX = '[^']*';/, "export const STORAGE_PREFIX = 'melkplease';"],
  [/export const CHANNEL_LABEL = '[^']*';/, "export const CHANNEL_LABEL = '';"],
  [/export const SERVER_CANAL = '[^']*';/, "export const SERVER_CANAL = '';"],
]);
patch('sw.js', [
  // Fins de ligne Windows ou Unix : les deux sont acceptées.
  [/const CACHE_PREFIX = '[^']*';\r?\nconst VERSION = `\$\{CACHE_PREFIX\}v\d+`;/,
    `// Préfixe propre à l'app principale : ne touche jamais aux caches de la bêta (melkplease-beta-*).\nconst CACHE_PREFIX = 'melkplease-v';\nconst VERSION = \`\${CACHE_PREFIX}${cache}\`;`],
]);
patch('manifest.webmanifest', [[/"name": "[^"]*"/, '"name": "MelkPlease"'], [/"short_name": "[^"]*"/, '"short_name": "MelkPlease"']]);
patch('index.html', [
  [/content="Melk bêta">/, 'content="MelkPlease">'],
  [/<span class="brand">MelkPlease <em class="channel">bêta<\/em><\/span>/, '<span class="brand">MelkPlease</span>'],
  [/<title>MelkPlease bêta<\/title>/, '<title>MelkPlease</title>'],
]);
patch('js/view-settings.js', [[/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${version}';`]]);
console.log(`Bêta passée dans l'app principale : version ${version}, cache melkplease-v${cache}.`);
