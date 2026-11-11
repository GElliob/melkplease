// Journal : tétées groupées par jour, touche une ligne pour la modifier.

import { MIN, dayKey, dayLabel, escapeHtml, fmtClock, fmtDuration } from './format.js';
import { sideDurations, sideOrder, totalDuration } from './feeds.js';

const PAGE_DAYS = 7;

function groupByDay(feeds) {
  return feeds.reduce((groups, feed) => {
    const key = dayKey(feed.start);
    const last = groups.at(-1);
    if (last?.key === key) return [...groups.slice(0, -1), { ...last, feeds: [...last.feeds, feed] }];
    return [...groups, { key, ts: feed.start, feeds: [feed] }];
  }, []);
}

function rowHtml(feed, previous) {
  const d = sideDurations(feed);
  const parts = sideOrder(feed)
    .map((s) => `<span class="pill side-${s}">${s}${feed.durationUnknown ? '' : ` ${Math.round(d[s] / MIN)}′`}</span>`)
    .join('');
  const total = feed.durationUnknown ? '?' : fmtDuration(totalDuration(feed));
  const gap = previous ? `<span class="gap">+${fmtDuration(feed.start - previous.start)}</span>` : '';
  const note = feed.note ? `<span class="row-note">${escapeHtml(feed.note)}</span>` : '';
  return `
    <button class="feed-row" data-action="edit" data-id="${escapeHtml(feed.id)}">
      <span class="time">${fmtClock(feed.start)}</span>
      <span class="parts">${parts}${note}</span>
      <span class="total">${total}${gap}</span>
    </button>`;
}

function dayHtml(group, now, olderFeed) {
  const timed = group.feeds.filter((f) => !f.durationUnknown);
  const total = timed.reduce((sum, f) => sum + totalDuration(f), 0);
  const rows = group.feeds.map((f, i) => rowHtml(f, group.feeds[i + 1] ?? (i === group.feeds.length - 1 ? olderFeed : null)));
  return `
    <section class="day">
      <h3>${dayLabel(group.ts, now)}<small>${group.feeds.length} tétée${group.feeds.length > 1 ? 's' : ''} · ${fmtDuration(total)}</small></h3>
      ${rows.join('')}
    </section>`;
}

export function renderJournal(root, state, now, visibleDays = PAGE_DAYS) {
  if (!state.feeds.length) {
    root.innerHTML = '<section class="empty"><p>Le journal est vide.</p></section>';
    return;
  }
  const groups = groupByDay(state.feeds);
  const shown = groups.slice(0, visibleDays);
  const html = shown.map((g, i) => dayHtml(g, now, groups[i + 1]?.feeds[0] ?? null)).join('');
  const more = groups.length > visibleDays
    ? `<button class="link-btn" data-action="more-days" data-days="${visibleDays + PAGE_DAYS}">Voir les jours précédents</button>`
    : '';
  root.innerHTML = `<div class="journal">${html}${more}</div>`;
}
