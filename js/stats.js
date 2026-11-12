// Statistiques : 24 dernières heures et 7 derniers jours.

import { DAY, addDays, startOfDay } from './format.js';
import { sideDurations, totalDuration } from './feeds.js';

const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function intervalsBetweenStarts(feedsAsc) {
  return feedsAsc.slice(1).map((f, i) => f.start - feedsAsc[i].start);
}

function last7Days(feeds, now) {
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const from = addDays(today, i - 6);
    const to = addDays(from, 1);
    const day = feeds.filter((f) => f.start >= from && f.start < to);
    return { from, count: day.length, totalMs: day.reduce((sum, f) => sum + totalDuration(f), 0) };
  });
}

export function computeStats(feeds, now) {
  const recent = feeds.filter((f) => f.start >= now - DAY && f.start <= now);
  const asc = [...recent].reverse();
  const timed = recent.filter((f) => !f.durationUnknown);
  const intervals = intervalsBetweenStarts(asc);
  const scores = recent.map((f) => f.score).filter(Number.isInteger);
  const sides = timed.reduce((acc, f) => {
    const d = sideDurations(f);
    return { G: acc.G + d.G, D: acc.D + d.D };
  }, { G: 0, D: 0 });

  return Object.freeze({
    count: recent.length,
    totalMs: timed.reduce((sum, f) => sum + totalDuration(f), 0),
    avgDuration: average(timed.map(totalDuration)),
    avgInterval: average(intervals),
    maxInterval: intervals.length ? Math.max(...intervals) : null,
    avgScore: average(scores),
    scoredCount: scores.length,
    sides,
    days: last7Days(feeds, now),
  });
}
