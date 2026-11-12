// Sorties fichier : sauvegarde JSON, export CSV, rappel calendrier (.ics).

import { MIN, dayKey, fmtClock } from './format.js';
import { sideDurations, sideOrder, totalDuration } from './feeds.js';
import { TOOL_BY_KEY } from './tracking-defs.js';
import { describeEvent } from './tracking-model.js';

/** Partage un fichier (feuille de partage iOS) ou le télécharge à défaut. Renvoie false si annulé. */
export async function shareOrDownload(content, name, type) {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false;
      console.error('[files] partage impossible, téléchargement à la place', err);
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function buildCsv(feeds) {
  const header = ['date', 'heure', 'gauche_min', 'droit_min', 'total_min', 'ordre', 'indice', 'note'];
  const rows = [...feeds].reverse().map((f) => {
    const d = sideDurations(f);
    const unknown = Boolean(f.durationUnknown);
    return [
      dayKey(f.start),
      fmtClock(f.start),
      unknown ? '' : Math.round(d.G / MIN),
      unknown ? '' : Math.round(d.D / MIN),
      unknown ? '' : Math.round(totalDuration(f) / MIN),
      sideOrder(f).join(' puis '),
      Number.isInteger(f.score) ? f.score : '',
      f.note,
    ].map(csvCell).join(';');
  });
  return `﻿${[header.join(';'), ...rows].join('\r\n')}`;
}

export function buildEventsCsv(events) {
  const header = ['date', 'heure', 'outil', 'detail', 'note'];
  const rows = [...events].reverse().map((e) =>
    [dayKey(e.at), fmtClock(e.at), TOOL_BY_KEY[e.type].name, describeEvent(e), e.data.note].map(csvCell).join(';'));
  return `﻿${[header.join(';'), ...rows].join('\r\n')}`;
}

const icsDate = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildReminderIcs(at, title) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MelkPlease//Tetees//FR',
    'BEGIN:VEVENT',
    `UID:${at}-tetee@melkplease`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(at)}`,
    `DTEND:${icsDate(at + 15 * MIN)}`,
    `SUMMARY:${title}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Ouvre le rappel : iOS propose « Ajouter au calendrier » avec l'alerte. */
export function openReminder(at, title) {
  const ics = buildReminderIcs(at, title);
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const link = Object.assign(document.createElement('a'), { href, download: 'rappel-tetee.ics' });
  document.body.append(link);
  link.click();
  link.remove();
}
