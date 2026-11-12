// Indice de tétée (0 à 5) : demandé d'un seul tap à la fin, modifiable ensuite.

import { SCORES, SCORE_ANCHORS } from './feeds.js';
import { closeSheet, openSheet } from './ui.js';

/** Rangée de six gros boutons + rappel des repères 0, 3 et 5. */
export function scoreScaleHtml(selected = null) {
  const buttons = SCORES.map((n) => `
    <button type="button" class="score-btn score-${n} ${selected === n ? 'on' : ''}" data-score="${n}"
      aria-label="Indice ${n}${SCORE_ANCHORS[n] ? ` : ${SCORE_ANCHORS[n]}` : ''}">${n}</button>`).join('');
  const anchors = Object.entries(SCORE_ANCHORS)
    .map(([n, label]) => `<li><span class="score-dot score-${n}">${n}</span>${label}</li>`).join('');
  return `<div class="score-scale" role="group" aria-label="Indice de la tétée">${buttons}</div>
    <ul class="score-anchors">${anchors}</ul>`;
}

/** Petit badge pour le journal ; rien si la tétée n'est pas notée. */
export function scoreBadgeHtml(score) {
  return Number.isInteger(score) ? `<span class="score-badge score-${score}" title="Indice ${score} sur 5">${score}</span>` : '';
}

/**
 * Panneau de fin de tétée. Un tap sur un chiffre enregistre et ferme.
 * @param {{ summary:string, onPick:(score:number)=>void, onSkip:()=>void }} opts
 */
export function openScoreSheet({ summary, onPick, onSkip }) {
  const html = `
    <div class="score-sheet">
      <h2>Comment s’est passée la tétée ?</h2>
      <p class="hint">${summary}</p>
      ${scoreScaleHtml()}
      <button type="button" class="link-btn" data-skip>Noter plus tard</button>
    </div>`;
  openSheet(html, (panel) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      closeSheet();
      fn();
    };
    panel.querySelectorAll('[data-score]').forEach((btn) =>
      btn.addEventListener('click', () => finish(() => onPick(Number(btn.dataset.score)))));
    panel.querySelector('[data-skip]').addEventListener('click', () => finish(onSkip));
    // Toucher hors du panneau revient à « Noter plus tard ».
    document.querySelector('#sheet .sheet-backdrop')?.addEventListener('click', () => {
      if (!done) {
        done = true;
        onSkip();
      }
    });
  });
}
