// Chrono d'une tétée en cours. Tout est horodaté : fermer l'app ou verrouiller
// le téléphone ne fait rien perdre, le temps se recalcule à la réouverture.
// active = { startedAt, segments: [...], current: { side, start } | null, pausedSide }

import { newId, otherSide } from './feeds.js';

export function startActive(side, now) {
  return Object.freeze({ startedAt: now, segments: [], current: { side, start: now }, pausedSide: null });
}

const closeCurrent = (active, now) =>
  active.current ? [...active.segments, { side: active.current.side, start: active.current.start, end: now }] : active.segments;

export function currentSide(active) {
  return active.current?.side ?? active.pausedSide;
}

export function switchSide(active, now) {
  const side = otherSide(currentSide(active));
  return Object.freeze({ ...active, segments: closeCurrent(active, now), current: { side, start: now }, pausedSide: null });
}

export function togglePause(active, now) {
  if (active.current) {
    return Object.freeze({ ...active, segments: closeCurrent(active, now), current: null, pausedSide: active.current.side });
  }
  return Object.freeze({ ...active, current: { side: active.pausedSide, start: now }, pausedSide: null });
}

/**
 * Un seul geste pour tout : toucher un sein démarre, change de côté,
 * met en pause (sein en cours) ou reprend (après une pause).
 */
export function tapSide(active, side, now) {
  if (!active) return startActive(side, now);
  if (active.current?.side === side) return togglePause(active, now);
  if (!active.current) return Object.freeze({ ...active, current: { side, start: now }, pausedSide: null });
  return switchSide(active, now);
}

export function elapsed(active, now) {
  const segments = closeCurrent(active, now);
  const bySide = segments.reduce((acc, s) => ({ ...acc, [s.side]: acc[s.side] + (s.end - s.start) }), { G: 0, D: 0 });
  return { ...bySide, total: bySide.G + bySide.D };
}

/** Transforme le chrono en tétée enregistrable (segments vides de moins d'une seconde retirés). */
export function finishActive(active, now) {
  const segments = closeCurrent(active, now).filter((s) => s.end - s.start >= 1000);
  if (!segments.length) return null;
  return Object.freeze({
    id: newId(),
    start: segments[0].start,
    end: segments.at(-1).end,
    segments,
    note: '',
    source: 'chrono',
  });
}
