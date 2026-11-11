// Réglages : intervalle, thème, rappels, import depuis Notes, sauvegarde.

import { MIN, dayKey, escapeHtml, fmtClock, fmtDuration, toDateInput } from './format.js';
import { sideOrder } from './feeds.js';
import { parseNotes, withoutDuplicates } from './import-notes.js';
import { bindSegmented, showError, stepperHtml } from './ui.js';

export const APP_VERSION = '1.1';
const THEMES = [['auto', 'Auto'], ['nuit', 'Nuit'], ['jour', 'Jour']];

function themeSeg(current) {
  const btns = THEMES.map(([v, l]) => `<button type="button" data-value="${v}" class="${v === current ? 'on' : ''}">${l}</button>`);
  return `<div class="seg" data-name="theme" data-value="${current}">${btns.join('')}</div>`;
}

function html(state, now) {
  const { settings, feeds } = state;
  const backup = settings.lastBackup ? `Dernière : ${new Date(settings.lastBackup).toLocaleDateString('fr-FR')}` : 'Jamais faite';
  return `
    <div class="settings">
      <section class="block">
        <h3>Prochaine tétée</h3>
        <p class="hint">Écart prévu entre deux débuts de tétée : ${fmtDuration(settings.intervalMin * MIN)}.</p>
        ${stepperHtml('interval', 'Écart', settings.intervalMin, 'interval')}
        <p class="hint">Les boutons ajoutent ou retirent 15 minutes.</p>
      </section>
      <section class="block">
        <h3>Affichage</h3>
        ${themeSeg(settings.theme)}
        <p class="hint">Auto : nuit de 19 h à 8 h.</p>
      </section>
      <section class="block">
        <h3>Rappel</h3>
        <button class="btn" data-action="reminder" ${feeds.length ? '' : 'disabled'}>Ajouter la prochaine tétée au calendrier</button>
        <p class="hint">Crée une alerte dans le calendrier de l’iPhone à l’heure prévue.</p>
      </section>
      <section class="block">
        <h3>Importer depuis Notes</h3>
        <p class="hint">Copie la note, colle-la ici. Une tétée par ligne, par exemple « 14h30 G 10 min D 5 min ». Une ligne « 11/11 » change de jour.</p>
        <label class="field"><span>Jour de départ</span><input type="date" name="import-day" value="${toDateInput(now)}"></label>
        <textarea name="import-text" rows="6" placeholder="Colle ici le texte de la note"></textarea>
        <button class="btn" data-action="import-preview">Analyser</button>
        <div class="import-preview"></div>
      </section>
      <section class="block">
        <h3>Sauvegarde · ${feeds.length} tétée${feeds.length > 1 ? 's' : ''}</h3>
        <p class="hint">${backup}. Les données restent sur ce téléphone : fais une sauvegarde chaque semaine.</p>
        <button class="btn" data-action="backup">Sauvegarder</button>
        <button class="btn ghost" data-action="csv">Exporter en tableau (CSV)</button>
        <label class="btn ghost file-btn">Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-action="restore" hidden></label>
      </section>
      <p class="version">MelkPlease ${APP_VERSION}</p>
    </div>`;
}

function previewHtml(found, skipped, duplicates) {
  const list = found.slice(0, 30).map((f) =>
    `<li>${dayKey(f.start)} ${fmtClock(f.start)} · ${sideOrder(f).join(' puis ')} · ${f.durationUnknown ? 'durée ?' : fmtDuration(f.end - f.start)}</li>`).join('');
  const skippedList = skipped.slice(0, 20).map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  return `
    <p><strong>${found.length}</strong> tétée(s) reconnue(s)${duplicates ? `, ${duplicates} déjà présente(s)` : ''}.</p>
    <ul class="preview-list">${list}</ul>
    ${skipped.length ? `<p class="hint">${skipped.length} ligne(s) non comprise(s) :</p><ul class="preview-list skipped">${skippedList}</ul>` : ''}
    ${found.length ? `<button class="btn primary" data-action="import-confirm">Importer ${found.length} tétée(s)</button>` : ''}`;
}

/**
 * @param {HTMLElement} root
 * @param {object} state
 * @param {number} now
 * @param {{ updateSettings, importFeeds, backup, csv, restore, reminder }} actions
 */
export function renderSettings(root, state, now, actions) {
  root.innerHTML = html(state, now);
  let pending = [];

  bindSegmented(root);
  root.querySelector('.seg[data-name="theme"]').addEventListener('change', (e) => actions.updateSettings({ theme: e.currentTarget.dataset.value }));

  const interval = root.querySelector('input[name="interval"]');
  root.querySelectorAll('.interval [data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = Math.min(360, Math.max(60, state.settings.intervalMin + Number(btn.dataset.step) * 15));
      actions.updateSettings({ intervalMin: next });
    });
  });
  interval.addEventListener('change', () => {
    const value = Math.round(Number(interval.value));
    if (value >= 60 && value <= 360) actions.updateSettings({ intervalMin: value });
    else showError(new Error('Écart entre 60 et 360 minutes.'));
  });

  root.querySelector('[data-action="import-preview"]').addEventListener('click', () => {
    try {
      const text = root.querySelector('textarea[name="import-text"]').value;
      const day = new Date(`${root.querySelector('input[name="import-day"]').value}T00:00`).getTime();
      if (!text.trim()) throw new Error('Colle d’abord le texte de la note.');
      if (!Number.isFinite(day)) throw new Error('Jour de départ invalide.');
      const { feeds, skipped } = parseNotes(text, day, now);
      pending = withoutDuplicates(feeds, state.feeds);
      const preview = root.querySelector('.import-preview');
      preview.innerHTML = previewHtml(pending, skipped, feeds.length - pending.length);
      preview.querySelector('[data-action="import-confirm"]')?.addEventListener('click', () => actions.importFeeds(pending));
    } catch (err) {
      showError(err);
    }
  });

  root.querySelector('[data-action="backup"]').addEventListener('click', actions.backup);
  root.querySelector('[data-action="csv"]').addEventListener('click', actions.csv);
  root.querySelector('[data-action="reminder"]').addEventListener('click', actions.reminder);
  root.querySelector('[data-action="restore"]').addEventListener('change', (e) => {
    const file = e.currentTarget.files?.[0];
    if (file) actions.restore(file);
  });
}
