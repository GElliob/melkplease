// Formulaire d'une tétée : saisie après coup ou modification.

import { MIN, SIDE_LABEL, escapeHtml, fromLocalInput, toLocalInput } from './format.js';
import { buildFeed, firstSide, otherSide, sideDurations, withScore } from './feeds.js';
import { scoreScaleHtml } from './score.js';
import { bindSegmented, bindSteppers, closeSheet, openSheet, showError, stepperHtml } from './ui.js';

function initialValues(feed, suggested, now) {
  if (!feed) {
    return { start: now - 20 * MIN, first: suggested, minutes: { [suggested]: 10, [otherSide(suggested)]: 0 }, note: '', score: null };
  }
  const d = sideDurations(feed);
  return {
    start: feed.start,
    first: firstSide(feed),
    minutes: { G: Math.round(d.G / MIN), D: Math.round(d.D / MIN) },
    note: feed.note ?? '',
    score: Number.isInteger(feed.score) ? feed.score : null,
  };
}

function formHtml(feed, v) {
  const sideBtn = (side) =>
    `<button type="button" data-value="${side}" class="side-${side} ${v.first === side ? 'on' : ''}">${SIDE_LABEL[side]}</button>`;
  return `
    <form class="feed-form" novalidate>
      <h2>${feed ? 'Modifier la tétée' : 'Tétée passée'}</h2>
      <label class="field"><span>Début</span>
        <input type="datetime-local" name="start" value="${toLocalInput(v.start)}" required></label>
      <div class="field"><span>Commencé par</span>
        <div class="seg" data-name="first" data-value="${v.first}">${sideBtn('G')}${sideBtn('D')}</div></div>
      ${feed?.durationUnknown ? '<p class="hint">Durée non notée à l’origine : complète-la si tu la connais.</p>' : ''}
      ${stepperHtml('min-G', 'Gauche', v.minutes.G, 'side-G')}
      ${stepperHtml('min-D', 'Droit', v.minutes.D, 'side-D')}
      <div class="field score-field" data-score-value="${v.score ?? ''}"><span>Indice (toucher à nouveau pour effacer)</span>
        ${scoreScaleHtml(v.score)}</div>
      <label class="field"><span>Note</span>
        <textarea name="note" rows="2" maxlength="300" placeholder="Facultatif">${escapeHtml(v.note)}</textarea></label>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close-sheet>Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
      ${feed ? '<button type="button" class="link-btn danger" data-delete>Supprimer cette tétée</button>' : ''}
    </form>`;
}

function readForm(form) {
  const data = new FormData(form);
  const toInt = (name) => {
    const n = Number(data.get(name));
    if (!Number.isInteger(n)) throw new Error('Les durées doivent être des minutes entières.');
    return n;
  };
  return {
    start: fromLocalInput(String(data.get('start'))),
    first: form.querySelector('.seg[data-name="first"]').dataset.value,
    minutes: { G: toInt('min-G'), D: toInt('min-D') },
    note: String(data.get('note') ?? ''),
    score: readScore(form),
  };
}

function readScore(form) {
  const raw = form.querySelector('.score-field').dataset.scoreValue;
  return raw === '' ? null : Number(raw);
}

/** Toucher un chiffre le sélectionne, le toucher à nouveau l'efface. */
function bindScoreField(form) {
  const field = form.querySelector('.score-field');
  field.querySelectorAll('[data-score]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = field.dataset.scoreValue === btn.dataset.score ? '' : btn.dataset.score;
      field.dataset.scoreValue = next;
      field.querySelectorAll('[data-score]').forEach((b) => b.classList.toggle('on', b.dataset.score === next));
    });
  });
}

const sameValues = (a, b) =>
  a.start === b.start && a.first === b.first && a.minutes.G === b.minutes.G && a.minutes.D === b.minutes.D;

/**
 * @param {{ feed?:object, suggested:'G'|'D', now:number, onSave:(feed)=>void, onDelete?:(id)=>void }} opts
 */
export function openFeedForm({ feed, suggested, now, onSave, onDelete }) {
  const initial = initialValues(feed, suggested, now);
  openSheet(formHtml(feed, initial), (panel) => {
    const form = panel.querySelector('form');
    bindSteppers(form);
    bindSegmented(form);
    bindScoreField(form);
    form.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const values = readForm(form);
        if (values.start > Date.now() + 5 * MIN) throw new Error('Le début est dans le futur.');
        const saved = feed && sameValues(values, initial)
          ? withScore(Object.freeze({ ...feed, note: values.note.trim().slice(0, 300) }), values.score)
          : buildFeed({ ...values, id: feed?.id, source: feed?.source ?? 'manuel' });
        onSave(saved);
        closeSheet();
      } catch (err) {
        showError(err);
      }
    });

    form.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (window.confirm('Supprimer cette tétée ?')) {
        onDelete?.(feed.id);
        closeSheet();
      }
    });
  });
}
