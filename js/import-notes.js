// Lecture d'un historique tapé dans Notes (iPhone). Format libre, ligne par ligne :
//   « 11/11 »  ou  « mardi 11 novembre »         → change le jour courant
//   « 14h30 G 10 min D 5 min »  « 3:15 droite 12' » « 22h G+D 20mn » → une tétée
// Les lignes non comprises sont listées pour vérification, rien n'est deviné en silence.

import { MIN, DAY, startOfDay } from './format.js';
import { buildFeed, otherSide } from './feeds.js';

const MONTHS = Object.freeze({
  janv: 0, janvier: 0, fev: 1, fevr: 1, fevrier: 1, mars: 2, avr: 3, avril: 3, mai: 4, juin: 5,
  juil: 6, juillet: 6, aout: 7, sept: 8, septembre: 8, oct: 9, octobre: 9, nov: 10, novembre: 10,
  dec: 11, decembre: 11,
});

const TIME_RE = /(?<![\d/])(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?![\d/])/i;
const NUM_DATE_RE = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/;
const WORD_DATE_RE = /\b(\d{1,2})(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?/;
const DURATION_RE = /(\d{1,3})\s*(?:minutes?|min|mn|m\b|'|’)/gi;
const SIDE_RE = /\b(gauche|droite?|g|d)\b/gi;

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function resolveYear(day, month, year, now) {
  if (year) return year < 100 ? 2000 + year : year;
  const thisYear = new Date(now).getFullYear();
  const candidate = new Date(thisYear, month, day).getTime();
  return candidate > now + DAY ? thisYear - 1 : thisYear;
}

function parseDate(line, now) {
  const numeric = line.match(NUM_DATE_RE);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const year = resolveYear(day, month, numeric[3] && Number(numeric[3]), now);
      return { date: new Date(year, month, day).getTime(), rest: line.replace(numeric[0], ' ') };
    }
  }
  const worded = line.match(WORD_DATE_RE);
  if (worded && worded[2] in MONTHS) {
    const day = Number(worded[1]);
    const month = MONTHS[worded[2]];
    const year = resolveYear(day, month, worded[3] && Number(worded[3]), now);
    return { date: new Date(year, month, day).getTime(), rest: line.replace(worded[0], ' ') };
  }
  return { date: null, rest: line };
}

const toSide = (token) => (token.startsWith('g') ? 'G' : 'D');

function minutesFor(sides, durations) {
  const [first, second] = sides;
  if (durations.length >= 2 && second) return { [first]: durations[0], [second]: durations[1] };
  if (durations.length === 1 && second) {
    const half = Math.round(durations[0] / 2);
    return { [first]: half, [second]: durations[0] - half };
  }
  return { [first]: durations[0] ?? 0, [otherSide(first)]: 0 };
}

function parseFeedLine(line, day) {
  const time = line.match(TIME_RE);
  if (!time) return null;
  const hours = Number(time[1]);
  const minutes = Number(time[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  const rest = line.replace(time[0], ' ');
  const sides = [...new Set([...rest.matchAll(SIDE_RE)].map((m) => toSide(m[1])))];
  if (!sides.length) return null;
  const durations = [...rest.matchAll(DURATION_RE)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 180);
  const start = day + hours * 60 * MIN + minutes * MIN;
  const split = minutesFor(sides, durations);
  return buildFeed({
    start,
    first: sides[0],
    minutes: { G: split.G ?? 0, D: split.D ?? 0 },
    source: 'import',
    durationUnknown: durations.length === 0,
  });
}

/**
 * @param {string} text  texte collé depuis Notes
 * @param {number} baseDay  jour utilisé tant qu'aucune date n'est trouvée
 * @param {number} now
 * @returns {{ feeds: object[], skipped: string[] }}
 */
export function parseNotes(text, baseDay, now) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.reduce(
    (acc, raw) => {
      const { date, rest } = parseDate(normalize(raw), now);
      const day = date ?? acc.day;
      try {
        const feed = parseFeedLine(rest, day);
        if (feed) return { ...acc, day, feeds: [...acc.feeds, feed] };
      } catch (err) {
        return { ...acc, day, skipped: [...acc.skipped, `${raw}  (${err.message})`] };
      }
      return date ? { ...acc, day } : { ...acc, skipped: [...acc.skipped, raw] };
    },
    { day: startOfDay(baseDay), feeds: [], skipped: [] },
  );
}

/** Retire les tétées déjà présentes (même début à 2 minutes près). */
export function withoutDuplicates(parsed, existing) {
  return parsed.filter((p) => !existing.some((e) => Math.abs(e.start - p.start) < 2 * MIN));
}
