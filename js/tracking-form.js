// Formulaire générique d'un outil de suivi : ajout ou modification.

import { MIN, escapeHtml, fromLocalInput, toLocalInput } from './format.js';
import { TOOL_BY_KEY, isShown } from './tracking-defs.js';
import { FEVER_THRESHOLD, buildEvent } from './tracking-model.js';
import { closeSheet, openSheet, showError } from './ui.js';

const SEP = '|';

function fieldHtml(field, value) {
  const name = `f-${field.key}`;
  const label = `<span>${field.label}${field.unit ? ` (${field.unit})` : ''}</span>`;
  switch (field.type) {
    case 'choice':
    case 'multi': {
      const selected = field.type === 'multi' ? (value ?? []) : [value];
      const buttons = field.options.map(([v, l]) =>
        `<button type="button" data-value="${v}" class="${selected.includes(v) ? 'on' : ''}">${l}</button>`).join('');
      return `<div class="field" data-field="${field.key}">${label}
        <div class="chips-choice" data-kind="${field.type}" data-name="${field.key}" data-value="${escapeHtml(selected.filter(Boolean).join(SEP))}">${buttons}</div></div>`;
    }
    case 'number':
      return `<label class="field" data-field="${field.key}">${label}
        <input type="text" inputmode="decimal" name="${name}" value="${value ?? ''}" autocomplete="off"></label>`;
    case 'datetime':
      return `<label class="field" data-field="${field.key}">${label}
        <input type="datetime-local" name="${name}" value="${value ? toLocalInput(value) : ''}"></label>`;
    case 'textarea':
      return `<label class="field" data-field="${field.key}">${label}
        <textarea name="${name}" rows="3" maxlength="${field.max}">${escapeHtml(value ?? '')}</textarea></label>`;
    default:
      return `<label class="field" data-field="${field.key}">${label}
        <input type="text" name="${name}" maxlength="${field.max}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(field.placeholder ?? '')}"></label>`;
  }
}

function readValues(form, tool) {
  const data = new FormData(form);
  return tool.fields.reduce((acc, field) => {
    if (field.type === 'choice' || field.type === 'multi') {
      const raw = form.querySelector(`.chips-choice[data-name="${field.key}"]`).dataset.value;
      const list = raw ? raw.split(SEP) : [];
      return { ...acc, [field.key]: field.type === 'multi' ? list : list[0] ?? null };
    }
    const raw = String(data.get(`f-${field.key}`) ?? '');
    if (field.type === 'datetime') return { ...acc, [field.key]: raw ? fromLocalInput(raw) : null };
    return { ...acc, [field.key]: raw };
  }, {});
}

function refreshVisibility(form, tool) {
  const values = readValues(form, tool);
  tool.fields.forEach((field) => {
    const el = form.querySelector(`[data-field="${field.key}"]`);
    if (el) el.hidden = !isShown(field, values);
  });
  const temp = Number(String(values.temp ?? '').replace(',', '.'));
  const warn = form.querySelector('.fever');
  if (warn) warn.hidden = !(temp >= FEVER_THRESHOLD);
}

function bindChips(form, tool) {
  form.querySelectorAll('.chips-choice').forEach((group) => {
    group.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const current = group.dataset.value ? group.dataset.value.split(SEP) : [];
        const v = btn.dataset.value;
        const next = group.dataset.kind === 'multi'
          ? (current.includes(v) ? current.filter((x) => x !== v) : [...current, v])
          : (current[0] === v ? [] : [v]);
        group.dataset.value = next.join(SEP);
        group.querySelectorAll('button').forEach((b) => b.classList.toggle('on', next.includes(b.dataset.value)));
        refreshVisibility(form, tool);
      });
    });
  });
}

/**
 * @param {{ type:string, event?:object, prefill?:object, onSave:(e)=>void, onDelete?:(id)=>void }} opts
 */
export function openTrackingForm({ type, event, prefill = {}, onSave, onDelete }) {
  const tool = TOOL_BY_KEY[type];
  const now = Date.now();
  const at = event?.at ?? now - (tool.defaultAgoMin ?? 0) * MIN;
  const values = { ...(type === 'sommeil' && !event ? { end: now } : {}), ...prefill, ...(event?.data ?? {}) };
  const html = `
    <form class="feed-form tracking-form" novalidate>
      <h2>${tool.icon} ${event ? 'Modifier' : tool.name}</h2>
      <label class="field"><span>${tool.atLabel}</span>
        <input type="datetime-local" name="at" value="${toLocalInput(at)}" required></label>
      ${tool.fields.map((f) => fieldHtml(f, values[f.key])).join('')}
      ${type === 'sante' ? `<p class="fever" hidden>${FEVER_THRESHOLD} °C ou plus avant 3 mois : appeler le médecin, ou le 15 la nuit.</p>` : ''}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close-sheet>Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
      ${event ? '<button type="button" class="link-btn danger" data-delete>Supprimer</button>' : ''}
    </form>`;

  openSheet(html, (panel) => {
    const form = panel.querySelector('form');
    bindChips(form, tool);
    form.addEventListener('input', () => refreshVisibility(form, tool));
    refreshVisibility(form, tool);
    form.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const when = fromLocalInput(String(new FormData(form).get('at')));
        onSave(buildEvent(type, when, readValues(form, tool), event?.id));
        closeSheet();
      } catch (err) {
        showError(err);
      }
    });
    form.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (window.confirm('Supprimer cette entrée ?')) {
        onDelete?.(event.id);
        closeSheet();
      }
    });
  });
}
