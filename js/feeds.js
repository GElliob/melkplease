// Règles métier des tétées : durées par sein, sein conseillé, prochaine tétée.
// Une tétée = { id, start, end, segments: [{ side: 'G'|'D', start, end }], note, source, durationUnknown? }

import { MIN } from './format.js';

export const SIDES = Object.freeze(['G', 'D']);
export const MAX_SIDE_MIN = 180;

export const otherSide = (side) => (side === 'G' ? 'D' : 'G');

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sideDurations(feed) {
  return feed.segments.reduce(
    (acc, s) => ({ ...acc, [s.side]: acc[s.side] + (s.end - s.start) }),
    { G: 0, D: 0 },
  );
}

export function totalDuration(feed) {
  const d = sideDurations(feed);
  return d.G + d.D;
}

/** Ordre des seins sans répétition consécutive : ['G', 'D'] */
export function sideOrder(feed) {
  return feed.segments.reduce((acc, s) => (acc.at(-1) === s.side ? acc : [...acc, s.side]), []);
}

export const firstSide = (feed) => feed.segments[0]?.side ?? null;
export const lastSide = (feed) => feed.segments.at(-1)?.side ?? null;

/**
 * Sein conseillé pour la prochaine tétée : le moins sollicité la dernière fois.
 * Deux seins donnés → on repart sur le second. Un seul → on change.
 */
export function suggestNextSide(feeds) {
  const last = feeds[0];
  if (!last || !last.segments.length) return { side: 'G', reason: null };
  const order = sideOrder(last);
  if (order.length >= 2 || new Set(order).size === 2) {
    return { side: lastSide(last), reason: `terminé ${lastSide(last) === 'G' ? 'à gauche' : 'à droite'} la dernière fois` };
  }
  const only = order[0];
  return { side: otherSide(only), reason: `seulement ${only === 'G' ? 'à gauche' : 'à droite'} la dernière fois` };
}

/** Prochaine tétée estimée, comptée depuis le début de la dernière (usage pédiatrique). */
export function nextFeedAt(feeds, intervalMin) {
  const last = feeds[0];
  return last ? last.start + intervalMin * MIN : null;
}

/**
 * Construit une tétée saisie à la main.
 * @param {{ start:number, first:'G'|'D', minutes:{G:number,D:number}, note?:string, source?:string, durationUnknown?:boolean }} input
 */
export function buildFeed({ id, start, first, minutes, note = '', source = 'manuel', durationUnknown = false }) {
  if (!Number.isFinite(start)) throw new Error('Heure de début invalide.');
  if (!SIDES.includes(first)) throw new Error('Sein de départ invalide.');
  const order = [first, otherSide(first)];
  order.forEach((side) => {
    const m = minutes[side];
    if (!Number.isInteger(m) || m < 0 || m > MAX_SIDE_MIN) {
      throw new Error(`Durée ${side === 'G' ? 'gauche' : 'droite'} invalide (0 à ${MAX_SIDE_MIN} min).`);
    }
  });
  if (!durationUnknown && minutes.G + minutes.D === 0) throw new Error('Indique au moins une durée.');

  const segments = durationUnknown
    ? [{ side: first, start, end: start }]
    : order
        .filter((side) => minutes[side] > 0)
        .reduce((acc, side) => {
          const from = acc.length ? acc.at(-1).end : start;
          return [...acc, { side, start: from, end: from + minutes[side] * MIN }];
        }, []);

  return Object.freeze({
    id: id ?? newId(),
    start,
    end: segments.at(-1).end,
    segments,
    note: String(note).trim().slice(0, 300),
    source,
    ...(durationUnknown ? { durationUnknown: true } : {}),
  });
}

export function isValidFeed(f) {
  return Boolean(
    f &&
      typeof f.id === 'string' &&
      Number.isFinite(f.start) &&
      Array.isArray(f.segments) &&
      f.segments.length > 0 &&
      f.segments.every(
        (s) => SIDES.includes(s.side) && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start,
      ),
  );
}

export const sortFeeds = (feeds) => [...feeds].sort((a, b) => b.start - a.start);
