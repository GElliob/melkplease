// Formats d'affichage (heures, durées, dates) et petites aides partagées.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const SIDE_LABEL = Object.freeze({ G: 'Gauche', D: 'Droit' });
export const SIDE_AT = Object.freeze({ G: 'à gauche', D: 'à droite' });

const pad = (n) => String(n).padStart(2, '0');

export function fmtClock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Chrono : 05:42 ou 1:05:42 */
export function fmtTimer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Durée lisible : 18 min ou 2 h 05 */
export function fmtDuration(ms) {
  const m = Math.round(Math.max(0, ms) / MIN);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

export function fmtAgo(ms) {
  if (ms < MIN) return "à l'instant";
  return `il y a ${fmtDuration(ms)}`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(ts, now) {
  const today = startOfDay(now);
  const day = startOfDay(ts);
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, -1)) return 'Hier';
  const label = new Date(ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDay(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
}

/** Valeur pour <input type="datetime-local"> en heure locale */
export function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(ts) {
  return dayKey(ts);
}

export function fromLocalInput(value) {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) throw new Error('Date ou heure invalide.');
  return ts;
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
