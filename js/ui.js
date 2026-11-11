// Briques d'interface : panneau du bas (bottom sheet), toast, stepper de minutes.

const sheetEl = () => document.getElementById('sheet');
const toastEl = () => document.getElementById('toast');

export function openSheet(html, onMount) {
  hideToast();
  const el = sheetEl();
  el.innerHTML = `<div class="sheet-backdrop" data-close-sheet></div><div class="sheet-panel" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
  el.querySelectorAll('[data-close-sheet]').forEach((b) => b.addEventListener('click', closeSheet));
  onMount?.(el.querySelector('.sheet-panel'));
}

export function closeSheet() {
  const el = sheetEl();
  el.classList.remove('open');
  setTimeout(() => {
    el.hidden = true;
    el.innerHTML = '';
  }, 200);
}

let toastTimer = null;

/**
 * @param {string} message
 * @param {{ label:string, run:() => void }[]} actions
 */
export function showToast(message, actions = [], durationMs = 6000) {
  const el = toastEl();
  clearTimeout(toastTimer);
  el.innerHTML = `<span class="toast-msg"></span><div class="toast-actions"></div>`;
  el.querySelector('.toast-msg').textContent = message;
  const holder = el.querySelector('.toast-actions');
  actions.forEach(({ label, run }) => {
    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
    btn.addEventListener('click', () => {
      hideToast();
      run();
    });
    holder.append(btn);
  });
  el.hidden = false;
  toastTimer = setTimeout(hideToast, durationMs);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastEl().hidden = true;
}

export function showError(err) {
  console.error(err);
  showToast(err?.message || 'Une erreur est survenue.', [], 5000);
}

export function stepperHtml(name, label, value, cssClass = '') {
  return `
    <div class="stepper ${cssClass}">
      <span class="stepper-label">${label}</span>
      <button type="button" class="step" data-step="-1" data-target="${name}" aria-label="Moins une minute">−</button>
      <label class="step-value"><input type="number" inputmode="numeric" min="0" max="180" name="${name}" value="${value}"><span>min</span></label>
      <button type="button" class="step" data-step="1" data-target="${name}" aria-label="Plus une minute">+</button>
    </div>`;
}

export function bindSteppers(root) {
  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = root.querySelector(`input[name="${btn.dataset.target}"]`);
      const next = Math.min(180, Math.max(0, (Number(input.value) || 0) + Number(btn.dataset.step)));
      input.value = String(next);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

export function bindSegmented(root) {
  root.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
        seg.dataset.value = btn.dataset.value;
        seg.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
}
