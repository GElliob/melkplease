// Actions de l'écran Suivi : ouvrir un outil, saisie d'un tap, ajout détaillé, modification.

import { TOOL_BY_KEY } from './tracking-defs.js';
import { buildEvent, describeEvent } from './tracking-model.js';
import { openTrackingForm } from './tracking-form.js';
import { showToast } from './ui.js';

/**
 * @param {{ getState:()=>object, setState:(p)=>void, commitEvents:(e)=>void, safe:(fn)=>Function }} deps
 */
export function suiviHandlers({ getState, setState, commitEvents }) {
  const upsert = (event) => commitEvents([event, ...getState().events.filter((e) => e.id !== event.id)]);

  const remove = (id) => {
    const removed = getState().events.find((e) => e.id === id);
    commitEvents(getState().events.filter((e) => e.id !== id));
    showToast('Entrée supprimée.', [{ label: 'Annuler', run: () => upsert(removed) }]);
  };

  const openForm = (type, event) => openTrackingForm({
    type,
    event,
    onSave: (saved) => {
      upsert(saved);
      showToast(`${TOOL_BY_KEY[type].name} : enregistré.`);
    },
    onDelete: remove,
  });

  return {
    'open-tool': (el) => setState({ tool: el.dataset.tool }),
    'close-tool': () => setState({ tool: null }),
    metric: (el) => setState({ growthMetric: el.dataset.metric }),
    'add-event': (el) => openForm(el.dataset.tool, null),
    'edit-event': (el) => {
      const event = getState().events.find((e) => e.id === el.dataset.id);
      if (!event) throw new Error('Entrée introuvable, elle a peut-être été supprimée.');
      openForm(event.type, event);
    },
    quick: (el) => {
      const type = el.dataset.tool;
      const preset = TOOL_BY_KEY[type].quick[Number(el.dataset.quick)];
      const event = buildEvent(type, Date.now(), preset.data);
      upsert(event);
      showToast(`${TOOL_BY_KEY[type].icon} ${describeEvent(event)} · enregistré`, [
        { label: 'Annuler', run: () => commitEvents(getState().events.filter((e) => e.id !== event.id)) },
        { label: 'Détails', run: () => openForm(type, getState().events.find((e) => e.id === event.id)) },
      ], 8000);
    },
  };
}
