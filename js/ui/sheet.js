/**
 * Lune — feuilles modales (bottom sheet), dialogue de confirmation et toasts.
 * Remplace alert/confirm natifs (indisponibles dans l'aperçu Artifact).
 *
 * Accessibilité : role="dialog" (ou "alertdialog"), aria-modal, titre relié,
 * focus piégé dans la feuille du dessus, Échap et clic sur le fond pour fermer,
 * contenu de l'app rendu inerte pendant l'ouverture, focus restauré à la fermeture.
 */

import { h, icon, richText } from './dom.js';

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'summary', 'iframe',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

const TOAST_MS = 3600;
const CLOSE_FALLBACK_MS = 320;

let uid = 0;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function focusables(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0);
}

/**
 * Crée la couche d'interface (feuilles, confirmations, toasts) liée à la racine de l'app.
 * Les calques sont ajoutés à <body>, à côté de `rootEl`, pour survivre aux re-rendus.
 *
 * @param {HTMLElement} rootEl  Racine de l'app (#app), rendue inerte quand une feuille est ouverte.
 * @returns {{
 *   toast: (msg: string) => void,
 *   openSheet: (opts: { title: string, content: Node, onClose?: () => void, dialog?: boolean }) => () => void,
 *   confirm: (opts: { title: string, text?: string|Node, confirmLabel?: string, cancelLabel?: string, danger?: boolean }) => Promise<boolean>,
 * }}
 */
export function createUI(rootEl) {
  const doc = rootEl.ownerDocument;
  /** @type {Array<{ layer: HTMLElement, panel: HTMLElement, close: () => void, returnFocus: Element|null }>} */
  const stack = [];
  // Région live créée tout de suite : les annonces sont plus fiables si elle préexiste.
  const toastRegion = h('div', { class: 'toast-region', role: 'status', ariaLive: 'polite' });
  doc.body.appendChild(toastRegion);

  function setBackgroundInert() {
    const open = stack.length > 0;
    rootEl.inert = open;
    if (open) rootEl.setAttribute('aria-hidden', 'true');
    else rootEl.removeAttribute('aria-hidden');
    doc.documentElement.classList.toggle('has-sheet', open);
    stack.forEach((entry, i) => {
      const isTop = i === stack.length - 1;
      entry.layer.inert = !isTop;
      entry.layer.classList.toggle('is-under', !isTop);
    });
  }

  function onKeydown(event) {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      top.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(top.panel);
    if (items.length === 0) {
      event.preventDefault();
      top.panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !top.panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !top.panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Ouvre une feuille modale. Plusieurs feuilles peuvent s'empiler ; seule celle du dessus est active.
   * @param {{ title: string, content: Node, onClose?: () => void, dialog?: boolean, initialFocus?: HTMLElement }} opts
   * @returns {() => void} close — ferme cette feuille (idempotent)
   */
  function openSheet({ title, content, onClose, dialog = false, initialFocus } = {}) {
    const id = `sheet-${++uid}`;
    const returnFocus = doc.activeElement;
    let closed = false;

    const closeBtn = h('button', {
      type: 'button',
      class: 'iconbtn sheet__close',
      ariaLabel: 'Fermer',
      on: { click: () => close() },
    }, icon('x', { size: 22 }));

    const panel = h('div', {
      class: ['sheet', dialog && 'sheet--dialog'],
      role: dialog ? 'alertdialog' : 'dialog',
      ariaModal: 'true',
      ariaLabelledby: `${id}-title`,
      ariaDescribedby: dialog ? `${id}-body` : null,
      tabIndex: -1,
    },
    h('div', { class: 'sheet__handle', ariaHidden: 'true' }),
    h('div', { class: 'sheet__header' },
      h('h2', { class: 'sheet__title', id: `${id}-title` }, title || ''),
      closeBtn),
    h('div', { class: 'sheet__body', id: `${id}-body` }, content || null));

    const backdrop = h('div', { class: 'sheet__backdrop', on: { click: () => close() } });
    const layer = h('div', { class: 'sheet-layer' }, backdrop, panel);

    const entry = { layer, panel, close, returnFocus };

    function close() {
      if (closed) return;
      closed = true;
      const idx = stack.indexOf(entry);
      if (idx !== -1) stack.splice(idx, 1);
      if (stack.length === 0) doc.removeEventListener('keydown', onKeydown, true);
      setBackgroundInert();

      layer.classList.remove('is-open');
      const remove = () => layer.remove();
      if (prefersReducedMotion()) remove();
      else {
        panel.addEventListener('transitionend', remove, { once: true });
        setTimeout(remove, CLOSE_FALLBACK_MS);
      }

      const target = returnFocus && returnFocus.isConnected ? returnFocus : null;
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      else if (stack.length) stack[stack.length - 1].panel.focus();

      if (typeof onClose === 'function') {
        try { onClose(); } catch (err) { console.error(err); }
      }
    }

    if (stack.length === 0) doc.addEventListener('keydown', onKeydown, true);
    stack.push(entry);
    doc.body.appendChild(layer);
    setBackgroundInert();

    // Laisse le navigateur peindre l'état initial avant d'animer.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!closed) layer.classList.add('is-open');
    }));

    const first = initialFocus || focusables(panel).find((el) => el !== closeBtn) || closeBtn;
    first.focus({ preventScroll: true });
    return close;
  }

  /**
   * Dialogue de confirmation maison.
   * @param {{ title: string, text?: string|Node, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} opts
   * @returns {Promise<boolean>} true si confirmé ; false si annulé, Échap ou clic sur le fond
   */
  function confirm({ title, text, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
    return new Promise((resolve) => {
      let result = false;
      let close = () => {};
      const cancelBtn = h('button', {
        type: 'button',
        class: 'btn btn--block',
        on: { click: () => close() },
      }, cancelLabel);
      const okBtn = h('button', {
        type: 'button',
        class: ['btn', 'btn--block', danger ? 'btn--danger' : 'btn--primary'],
        on: { click: () => { result = true; close(); } },
      }, confirmLabel);
      const body = h('div', { class: 'stack' },
        text ? h('p', { class: 'sheet__text' }, typeof text === 'string' ? richText(text) : text) : null,
        h('div', { class: 'sheet__actions' }, cancelBtn, okBtn));
      close = openSheet({
        title,
        content: body,
        dialog: true,
        // Action destructrice : le focus part sur « Annuler ».
        initialFocus: danger ? cancelBtn : okBtn,
        onClose: () => resolve(result),
      });
    });
  }

  /**
   * Message bref et non bloquant, annoncé aux lecteurs d'écran.
   * @param {string} msg
   */
  function toast(msg) {
    if (!toastRegion.isConnected) doc.body.appendChild(toastRegion);
    while (toastRegion.childElementCount >= 2) toastRegion.firstElementChild.remove();
    const el = h('div', { class: 'toast' }, String(msg));
    toastRegion.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : 250);
    }, TOAST_MS);
  }

  return { toast, openSheet, confirm };
}
