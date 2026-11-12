// Calculs du tableau de bord « Aujourd'hui » et du résumé de la semaine.
// Fonctions pures : (données, instant) → valeurs, sans toucher au DOM.

import { DAY, addDays, startOfDay } from './format.js';
import { sideDurations, totalDuration } from './feeds.js';

const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const overlap = (from, to, a, b) => Math.max(0, Math.min(to, b) - Math.max(from, a));

/** Âge lisible : « 3 jours », « 5 semaines », « 4 mois ». */
export function ageLabel(birth, now) {
  if (!birth || now < birth) return null;
  const days = Math.floor((startOfDay(now) - startOfDay(birth)) / DAY);
  if (days < 1) return 'Née aujourd’hui';
  if (days < 30) return `${days} jour${days > 1 ? 's' : ''}`;
  if (days < 91) return `${Math.floor(days / 7)} semaines`;
  const b = new Date(birth);
  const n = new Date(now);
  const months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() - (n.getDate() < b.getDate() ? 1 : 0);
  return `${months} mois`;
}

/** Tétées des dernières 24 h : nombre, temps total, indice moyen. */
export function feedsLast24h(feeds, now) {
  const recent = feeds.filter((f) => f.start > now - DAY && f.start <= now);
  const timed = recent.filter((f) => !f.durationUnknown);
  return {
    count: recent.length,
    totalMs: timed.reduce((s, f) => s + totalDuration(f), 0),
    avgScore: average(recent.map((f) => f.score).filter(Number.isInteger)),
  };
}

const sleeps = (events) => events.filter((e) => e.type === 'sommeil');

/** État du sommeil : endormie depuis / réveillée depuis / inconnu. */
export function sleepStatus(events, sleepActive, now) {
  if (sleepActive) return { asleep: true, since: sleepActive.start };
  const lastEnd = Math.max(...sleeps(events).map((e) => e.data.end).filter((t) => t <= now), -Infinity);
  return { asleep: false, since: Number.isFinite(lastEnd) ? lastEnd : null };
}

export function sleepMsBetween(events, from, to, sleepActive = null) {
  const done = sleeps(events).reduce((s, e) => s + overlap(from, to, e.at, e.data.end), 0);
  return done + (sleepActive ? overlap(from, to, sleepActive.start, to) : 0);
}

/**
 * Segments de la frise des 24 dernières heures, en fractions 0..1.
 * @returns {{ from:number, to:number, kind:string }[]}
 */
export function timelineSegments(feeds, events, sleepActive, now) {
  const from = now - DAY;
  const toFrac = (t) => Math.min(1, Math.max(0, (t - from) / DAY));
  const feedSegs = feeds
    .filter((f) => f.end > from && f.start <= now)
    .flatMap((f) => (f.durationUnknown
      ? [{ from: toFrac(f.start), to: toFrac(f.start), kind: f.segments[0].side }]
      : f.segments.map((s) => ({ from: toFrac(s.start), to: toFrac(s.end), kind: s.side }))));
  const sleepSegs = [
    ...sleeps(events).filter((e) => e.data.end > from && e.at <= now).map((e) => ({ from: toFrac(e.at), to: toFrac(e.data.end), kind: 'sleep' })),
    ...(sleepActive ? [{ from: toFrac(sleepActive.start), to: 1, kind: 'sleep' }] : []),
  ];
  return { feeds: feedSegs, sleep: sleepSegs };
}

/** Couches sur 24 h glissantes. */
export function diapersLast24h(events, now) {
  const day = events.filter((e) => e.type === 'couche' && e.at > now - DAY && e.at <= now);
  return { pipi: day.filter((e) => e.data.kind !== 'selles').length, selles: day.filter((e) => e.data.kind !== 'pipi').length };
}

export function vitaminDToday(events, now) {
  return events.find((e) => e.type === 'medic' && e.data.produit === 'vitd' && e.at >= startOfDay(now) && e.at <= now) ?? null;
}

/** Deux dernières pesées : dernier poids et écart avec la précédente. */
export function weightTrend(events) {
  const weighed = events.filter((e) => e.type === 'croissance' && e.data.poids !== undefined);
  const [last, previous] = weighed;
  if (!last) return null;
  return { last, deltaG: previous ? last.data.poids - previous.data.poids : null, sinceMs: previous ? last.at - previous.at : null };
}

export function nextAppointment(events, now) {
  return [...events].reverse().find((e) => e.type === 'rdv' && e.at >= now) ?? null;
}

/** Fenêtre de la semaine écoulée (lundi 0 h → lundi 0 h) quand on est lundi. */
export function previousWeekWindow(now) {
  const today = startOfDay(now);
  const weekday = (new Date(now).getDay() + 6) % 7;
  const thisMonday = addDays(today, -weekday);
  return { from: addDays(thisMonday, -7), to: thisMonday };
}

/** Résumé d'une semaine (ou de toute fenêtre de 7 jours). */
export function weekSummary(feeds, events, from, to) {
  const days = Math.max(1, Math.round((to - from) / DAY));
  const inWindow = feeds.filter((f) => f.start >= from && f.start < to);
  const timed = inWindow.filter((f) => !f.durationUnknown);
  const sides = timed.reduce((acc, f) => {
    const d = sideDurations(f);
    return { G: acc.G + d.G, D: acc.D + d.D };
  }, { G: 0, D: 0 });
  const diapers = events.filter((e) => e.type === 'couche' && e.at >= from && e.at < to);
  const weights = events.filter((e) => e.type === 'croissance' && e.data.poids !== undefined);
  const lastIn = weights.find((e) => e.at < to && e.at >= from);
  const before = weights.find((e) => e.at < (lastIn?.at ?? from) && e !== lastIn);
  return Object.freeze({
    days,
    feedsPerDay: inWindow.length / days,
    avgDuration: average(timed.map(totalDuration)),
    avgScore: average(inWindow.map((f) => f.score).filter(Number.isInteger)),
    sides,
    sleepPerDay: sleepMsBetween(events, from, to) / days,
    pipiPerDay: diapers.filter((e) => e.data.kind !== 'selles').length / days,
    sellesPerDay: diapers.filter((e) => e.data.kind !== 'pipi').length / days,
    weightGainG: lastIn && before ? lastIn.data.poids - before.data.poids : null,
    hasData: inWindow.length > 0 || diapers.length > 0,
  });
}
