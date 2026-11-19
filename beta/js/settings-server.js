// Réglages « Rappels et Siri » : code d'accès, notifications, réglages des rappels.

import { escapeHtml, fmtClock } from './format.js';
import { showError } from './ui.js';

let lastStatus = null;

function statusText(status) {
  if (!status) return 'Pas encore synchronisé.';
  return status.ok ? `Synchronisé à ${fmtClock(status.at)}.` : `Échec à ${fmtClock(status.at)} : ${status.error}`;
}

/** Mise à jour directe du texte d'état, sans redessiner l'écran (on peut être en train de taper). */
export function setSyncStatus(status) {
  lastStatus = status;
  const el = document.querySelector('[data-sync-status]');
  if (el) {
    el.textContent = statusText(status);
    el.classList.toggle('late', !status.ok);
  }
}

const seg = (name, current, options) => `<div class="seg" data-name="${name}" data-value="${current}">${options
  .map(([v, l]) => `<button type="button" data-value="${v}" class="${String(v) === String(current) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

export function serverSectionHtml(settings) {
  const connected = Boolean(settings.serverCode);
  const notifState = typeof Notification === 'undefined' ? 'indisponibles ici' : { granted: 'autorisées', denied: 'refusées', default: 'pas encore activées' }[Notification.permission];
  return `
    <section class="block">
      <h3>Rappels et Siri</h3>
      <label class="field"><span>Code d’accès du serveur</span>
        <input type="text" name="server-code" autocomplete="off" autocapitalize="off" spellcheck="false"
          value="${escapeHtml(settings.serverCode ?? '')}" placeholder="Colle ici le code reçu"></label>
      <button class="btn ghost" data-action="save-code">${connected ? 'Modifier le code' : 'Enregistrer le code'}</button>
      <p class="hint" data-sync-status>${statusText(lastStatus)}</p>
      ${connected ? `
        <p class="hint">Notifications : ${notifState}.</p>
        <button class="btn primary" data-action="enable-notifs">Activer les notifications</button>
        <button class="btn ghost" data-action="test-notif">Envoyer une notification de test</button>
        <div class="field"><span>Rappel de tétée</span>${seg('offset', settings.reminderOffsetMin, [[0, 'À l’heure'], [10, '10 min avant']])}</div>
        <div class="field"><span>Alerte si aucune tétée après l’heure prévue</span>${seg('late', settings.lateAlertMin, [[30, '+30 min'], [60, '+1 h'], [90, '+1 h 30']])}</div>
        <div class="field"><span>Rappel vitamine D</span>${seg('vitd', settings.vitdHour, [[8, '8 h'], [10, '10 h'], [12, '12 h'], [18, '18 h']])}</div>
        <div class="field"><span>Rappels de tétée la nuit (23 h à 6 h)</span>${seg('quiet', settings.quietNights ? 'on' : 'off', [['off', 'Oui'], ['on', 'Silence']])}</div>
        <button class="btn ghost" data-action="copy-code">Copier le code pour le raccourci Siri</button>` : ''}
    </section>`;
}

export function bindServerSection(root, actions) {
  const on = (sel, fn) => root.querySelector(sel)?.addEventListener('click', fn);
  on('[data-action="save-code"]', () => actions.saveServerCode(root.querySelector('input[name="server-code"]').value));
  on('[data-action="enable-notifs"]', actions.activateNotifications);
  on('[data-action="test-notif"]', actions.sendTestNotification);
  on('[data-action="copy-code"]', actions.copyServerCode);
  // Les sélecteurs .seg sont déjà rendus actifs par renderSettings (une seule fois).
  const onSeg = (name, toPatch) => root.querySelector(`.seg[data-name="${name}"]`)?.addEventListener('change', (e) => {
    try {
      actions.updateSettings(toPatch(e.currentTarget.dataset.value));
    } catch (err) {
      showError(err);
    }
  });
  onSeg('offset', (v) => ({ reminderOffsetMin: Number(v) }));
  onSeg('late', (v) => ({ lateAlertMin: Number(v) }));
  onSeg('vitd', (v) => ({ vitdHour: Number(v) }));
  onSeg('quiet', (v) => ({ quietNights: v === 'on' }));
}
