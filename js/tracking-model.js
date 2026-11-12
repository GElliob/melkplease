// Événements de suivi : validation, description lisible, résumés.
// Un événement = { id, type, at, data: { ...champs de l'outil } }

import { DAY, MIN, fmtAgo, fmtClock, fmtDuration, startOfDay } from './format.js';
import { newId } from './feeds.js';
import { TOOL_BY_KEY, isShown, optionLabel } from './tracking-defs.js';

const FUTURE_TOLERANCE = 5 * MIN;
const MAX_SLEEP = DAY;

function cleanValue(field, raw) {
  if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length)) return null;
  switch (field.type) {
    case 'number': {
      const n = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n) || n < field.min || n > field.max) {
        throw new Error(`${field.label} : entre ${field.min} et ${field.max} ${field.unit ?? ''}.`.trim());
      }
      return field.decimals ? Number(n.toFixed(field.decimals)) : Math.round(n);
    }
    case 'choice':
      if (!field.options.some(([v]) => v === raw)) throw new Error(`${field.label} : choix invalide.`);
      return raw;
    case 'multi': {
      const values = [...new Set(raw)];
      if (!values.every((v) => field.options.some(([o]) => o === v))) throw new Error(`${field.label} : choix invalide.`);
      return values;
    }
    case 'datetime':
      if (!Number.isFinite(raw)) throw new Error(`${field.label} : date invalide.`);
      return raw;
    default:
      return String(raw).trim().slice(0, field.max ?? 300) || null;
  }
}

/**
 * Valide et construit un événement. Lève une erreur lisible si quelque chose cloche.
 * @param {string} type @param {number} at @param {object} values @param {string} [id]
 */
export function buildEvent(type, at, values, id) {
  const tool = TOOL_BY_KEY[type];
  if (!tool) throw new Error('Outil inconnu.');
  if (!Number.isFinite(at)) throw new Error(`${tool.atLabel} : date invalide.`);
  if (!tool.allowFuture && at > Date.now() + FUTURE_TOLERANCE) throw new Error(`${tool.atLabel} : la date est dans le futur.`);

  const data = tool.fields.reduce((acc, field) => {
    if (!isShown(field, acc.all)) return acc;
    const value = cleanValue(field, values[field.key]);
    if (field.required && value === null) throw new Error(`${field.label} : à renseigner.`);
    return value === null ? acc : { all: acc.all, kept: { ...acc.kept, [field.key]: value } };
  }, { all: values, kept: {} }).kept;

  if (tool.needsOneOf && !tool.needsOneOf.some((k) => data[k] !== undefined)) {
    throw new Error('Renseigne au moins une valeur.');
  }
  if (type === 'sommeil') {
    if (data.end <= at) throw new Error('Le réveil doit être après l’endormissement.');
    if (data.end - at > MAX_SLEEP) throw new Error('Une période de sommeil ne peut pas dépasser 24 h.');
    if (data.end > Date.now() + FUTURE_TOLERANCE) throw new Error('Le réveil est dans le futur.');
  }
  return Object.freeze({ id: id ?? newId(), type, at, data: Object.freeze(data) });
}

export function isValidEvent(e) {
  return Boolean(e && typeof e.id === 'string' && TOOL_BY_KEY[e.type] && Number.isFinite(e.at) && e.data && typeof e.data === 'object');
}

/** Une ligne lisible : « Selles · jaune · grumeleuse » */
export function describeEvent(event) {
  const tool = TOOL_BY_KEY[event.type];
  const d = event.data;
  if (event.type === 'sommeil') {
    return [fmtDuration(d.end - event.at), d.lieu && optionLabel(tool.fields[1], d.lieu)].filter(Boolean).join(' · ');
  }
  if (event.type === 'medic' && d.produit === 'autre') return [d.nom, d.dose].filter(Boolean).join(' · ');
  return tool.fields
    .filter((f) => f.key !== 'note' && d[f.key] !== undefined && f.type !== 'datetime')
    .map((f) => {
      const v = d[f.key];
      if (f.type === 'choice') return optionLabel(f, v);
      if (f.type === 'multi') return v.map((x) => optionLabel(f, x)).join(', ');
      if (f.type === 'number') return `${v.toLocaleString('fr-FR')} ${f.unit}`;
      return v;
    })
    .join(' · ') || 'Fait';
}

const ofType = (events, type) => events.filter((e) => e.type === type);
const within24h = (events, now) => events.filter((e) => e.at > now - DAY && e.at <= now);

function sleepIn24h(events, now) {
  const from = now - DAY;
  return events.reduce((sum, e) => sum + Math.max(0, Math.min(e.data.end, now) - Math.max(e.at, from)), 0);
}

const SUMMARIES = Object.freeze({
  couche: (list, now) => {
    const day = within24h(list, now);
    const pipi = day.filter((e) => e.data.kind !== 'selles').length;
    const selles = day.filter((e) => e.data.kind !== 'pipi').length;
    return `24 h : ${pipi} pipi · ${selles} selles`;
  },
  sommeil: (list, now) => `24 h : ${fmtDuration(sleepIn24h(list, now))} de sommeil`,
  medic: (list, now) => {
    const vitd = list.find((e) => e.data.produit === 'vitd' && e.at >= startOfDay(now));
    return vitd ? `Vitamine D donnée à ${fmtClock(vitd.at)}` : 'Vitamine D : pas encore aujourd’hui';
  },
  biberon: (list, now) => {
    const day = within24h(list, now);
    const tire = day.filter((e) => e.data.kind === 'tire').reduce((s, e) => s + e.data.ml, 0);
    const bu = day.filter((e) => e.data.kind !== 'tire').reduce((s, e) => s + e.data.ml, 0);
    return `24 h : ${tire} ml tirés · ${bu} ml bus`;
  },
  sante: (list) => {
    const temp = list.find((e) => e.data.temp !== undefined);
    return temp ? `Dernière température : ${String(temp.data.temp).replace('.', ',')} °C` : null;
  },
  croissance: (list) => {
    const p = list.find((e) => e.data.poids !== undefined);
    return p ? `Dernier poids : ${p.data.poids.toLocaleString('fr-FR')} g le ${new Date(p.at).toLocaleDateString('fr-FR')}` : null;
  },
  rdv: (list, now) => {
    const next = [...list].reverse().find((e) => e.at >= now);
    return next ? `Prochain : ${describeEvent(next)}, ${new Date(next.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${fmtClock(next.at)}` : 'Aucun rendez-vous à venir';
  },
  souvenir: (list) => `${list.length} souvenir${list.length > 1 ? 's' : ''}`,
});

/** Résumé d'un outil (tableau trié du plus récent au plus ancien). */
export function summarize(type, events, now) {
  const list = ofType(events, type);
  const custom = SUMMARIES[type]?.(list, now);
  if (custom) return custom;
  const last = list.find((e) => e.at <= now);
  return last ? `Dernier : ${fmtAgo(now - last.at)}` : 'Rien de noté';
}

export const sortEvents = (events) => [...events].sort((a, b) => b.at - a.at);

/** Fièvre avant 3 mois : seuil retenu par les recommandations pédiatriques françaises. */
export const FEVER_THRESHOLD = 38;
