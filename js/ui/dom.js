/**
 * Lune — utilitaires d'interface partagés.
 *
 * - h() : construction du DOM sans innerHTML (HTML et SVG).
 * - icon() : pictogrammes SVG 24×24, trait 1,75, `currentColor`.
 * - Formatage français (dates, températures, pluriels).
 * - Métadonnées d'affichage des états, décisions, phases et surcouches.
 * - Listes d'options de saisie (libellés fidèles à docs/spec-medicale.md).
 * - Petits utilitaires de dates locales pour l'UI.
 *
 * Aucun accès à `document` / `window` au chargement : importable sous Node.
 * Seules h(), icon(), statusBadge() et richText() exigent un DOM, à l'appel.
 */

/* ------------------------------------------------------------------ */
/* h() — fabrique d'éléments                                           */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Balises créées dans l'espace de noms SVG (préfixer par « svg: » pour a, title, style…). */
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect',
  'text', 'tspan', 'defs', 'pattern', 'clipPath', 'mask', 'marker', 'use', 'symbol',
  'linearGradient', 'radialGradient', 'stop', 'foreignObject', 'desc',
]);

/** Attributs SVG dont la casse mixte doit être conservée telle quelle. */
const SVG_CAMEL_ATTRS = new Set([
  'viewBox', 'preserveAspectRatio', 'patternUnits', 'patternContentUnits', 'patternTransform',
  'gradientUnits', 'gradientTransform', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'textLength', 'lengthAdjust',
  'stdDeviation', 'pathLength', 'spreadMethod',
]);

/** Propriétés refusées : elles injecteraient du HTML brut. */
const FORBIDDEN_PROPS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc']);

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(el.ownerDocument.createTextNode(String(child)));
    } else el.appendChild(child);
  }
}

function setClass(el, value, isSvg) {
  const list = (Array.isArray(value) ? value.flat(Infinity) : [value]).filter(Boolean).join(' ');
  if (!list) return;
  if (isSvg) el.setAttribute('class', list);
  else el.className = list;
}

function setStyle(el, style) {
  if (typeof style === 'string') {
    el.setAttribute('style', style);
    return;
  }
  for (const [key, val] of Object.entries(style)) {
    if (val === null || val === undefined || val === false) continue;
    el.style.setProperty(key.startsWith('--') ? key : kebab(key), String(val));
  }
}

function setAttr(el, name, val) {
  if (val === null || val === undefined || val === false) return;
  el.setAttribute(name, val === true ? '' : String(val));
}

/**
 * Crée un élément DOM (HTML, ou SVG pour les balises SVG connues / préfixées « svg: »).
 * Jamais d'innerHTML : le texte est toujours inséré comme nœud texte.
 *
 * @param {string} tag  Nom de balise (ex. 'div', 'button', 'svg', 'svg:a').
 * @param {object} [props]
 *   - class : string | Array (valeurs fausses ignorées)
 *   - style : objet (camelCase, kebab-case ou variables CSS `--x` ; valeurs avec unité) ou chaîne
 *   - attrs : objet d'attributs (true → présent, false/null → absent)
 *   - dataset : objet de data-*
 *   - on : { click: fn, input: fn, … }
 *   - ariaXxx : traduit en attribut aria-xxx (ariaLabel → aria-label)
 *   - autres clés : propriété DOM si elle existe (id, type, value, checked, disabled,
 *     htmlFor, title, role, tabIndex, placeholder…), sinon attribut.
 * @param {...(Node|string|number|null|false|Array)} children
 * @returns {HTMLElement|SVGElement}
 */
export function h(tag, props = {}, ...children) {
  let name = tag;
  let isSvg = SVG_TAGS.has(tag);
  if (tag.startsWith('svg:')) {
    name = tag.slice(4);
    isSvg = true;
  }
  const el = isSvg ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  const p = props || {};

  // Enfants d'abord : permet de fixer `value` d'un <select> après ses <option>.
  appendChildren(el, children);

  // `type` avant `value` (inputs).
  if (p.type !== undefined && p.type !== null) {
    if (isSvg) el.setAttribute('type', p.type);
    else el.type = p.type;
  }

  for (const [key, val] of Object.entries(p)) {
    if (key === 'type') continue;
    if (FORBIDDEN_PROPS.has(key)) throw new Error(`h(): propriété interdite « ${key} »`);
    if (key === 'class' || key === 'className') setClass(el, val, isSvg);
    else if (key === 'style') { if (val) setStyle(el, val); }
    else if (key === 'attrs') { for (const [a, v] of Object.entries(val || {})) setAttr(el, a, v); }
    else if (key === 'dataset') {
      for (const [d, v] of Object.entries(val || {})) if (v !== null && v !== undefined) el.dataset[d] = String(v);
    } else if (key === 'on') {
      for (const [evt, fn] of Object.entries(val || {})) if (typeof fn === 'function') el.addEventListener(evt, fn);
    } else if (/^aria[A-Z]/.test(key)) setAttr(el, kebab(key), val);
    else if (key === 'role') setAttr(el, 'role', val);
    else if (isSvg) {
      setAttr(el, SVG_CAMEL_ATTRS.has(key) ? key : kebab(key), val);
    } else if (key === 'htmlFor') { if (val !== null && val !== undefined) el.htmlFor = val; }
    else if (key in el) { if (val !== undefined && val !== null) el[key] = val; }
    else setAttr(el, key, val);
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Icônes                                                              */
/* ------------------------------------------------------------------ */

/** Formes des icônes : [balise, attributs]. Grille 24×24, trait 1,75, extrémités rondes. */
const ICONS = {
  drop: [['path', { d: 'M12 3.5c-3.1 3.7-5.6 7-5.6 10.1a5.6 5.6 0 0 0 11.2 0c0-3.1-2.5-6.4-5.6-10.1z' }]],
  thermo: [
    ['path', { d: 'M10 14.4V5.2a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z' }],
    ['path', { d: 'M12 11v6' }],
  ],
  calendar: [
    ['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2 }],
    ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }],
  ],
  chart: [
    ['path', { d: 'M4 4v16h16' }],
    ['path', { d: 'M7 15.5l3-1 2.5 1.5 2-5 2 1.5 2.5-.5' }],
  ],
  book: [
    ['path', { d: 'M12 6.5C10.5 5.3 8.3 4.8 4 5v13c4.3-.2 6.5.3 8 1.5 1.5-1.2 3.7-1.7 8-1.5V5c-4.3-.2-6.5.3-8 1.5z' }],
    ['path', { d: 'M12 6.5v13' }],
  ],
  gear: [
    ['path', { d: 'M10.13 5.25L10.44 2.93H13.56L13.87 5.25L15.45 5.91L17.31 4.49L19.51 6.69L18.09 8.55L18.75 10.13L21.07 10.44V13.56L18.75 13.87L18.09 15.45L19.51 17.31L17.31 19.51L15.45 18.09L13.87 18.75L13.56 21.07H10.44L10.13 18.75L8.55 18.09L6.69 19.51L4.49 17.31L5.91 15.45L5.25 13.87L2.93 13.56V10.44L5.25 10.13L5.91 8.55L4.49 6.69L6.69 4.49L8.55 5.91Z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  minus: [['path', { d: 'M5 12h14' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  shield: [['path', { d: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z' }]],
  alert: [
    ['path', { d: 'M10.3 4.3L2.9 17.4a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z' }],
    ['path', { d: 'M12 9.5v4.5M12 17.2v.1' }],
  ],
  info: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 11v5.5M12 7.8v.1' }],
  ],
  help: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.6M12 17.2v.1' }],
  ],
  'chevron-left': [['path', { d: 'M14.5 6l-6 6 6 6' }]],
  'chevron-right': [['path', { d: 'M9.5 6l6 6-6 6' }]],
  'chevron-down': [['path', { d: 'M6 9.5l6 6 6-6' }]],
  x: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  moon: [['path', { d: 'M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z' }]],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4' }],
  ],
  heart: [['path', { d: 'M12 19.5s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 10-7.5 10z' }]],
  sparkle: [['path', { d: 'M12 3.5l1.8 5.2a2.5 2.5 0 0 0 1.5 1.5l5.2 1.8-5.2 1.8a2.5 2.5 0 0 0-1.5 1.5L12 20.5l-1.8-5.2a2.5 2.5 0 0 0-1.5-1.5L3.5 12l5.2-1.8a2.5 2.5 0 0 0 1.5-1.5z' }]],
  download: [['path', { d: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15' }]],
  upload: [['path', { d: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 19.5h15' }]],
  trash: [['path', { d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5' }]],
  edit: [['path', { d: 'M15.5 4.5l4 4L9 19H5v-4zM13.5 6.5l4 4' }]],
  bell: [['path', { d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0' }]],
  lock: [
    ['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2 }],
    ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2' }],
  ],
  egg: [['path', { d: 'M12 3.5c-3.6 0-6.5 5.4-6.5 9.7a6.5 6.5 0 0 0 13 0c0-4.3-2.9-9.7-6.5-9.7z' }]],
  flask: [['path', { d: 'M9.5 3.5h5M10.5 3.5v5.2L5 18.2a1.5 1.5 0 0 0 1.3 2.3h11.4a1.5 1.5 0 0 0 1.3-2.3l-5.5-9.5V3.5M7.4 14.5h9.2' }]],
  test: [
    ['rect', { x: 8.5, y: 2.5, width: 7, height: 19, rx: 2 }],
    ['rect', { x: 10.5, y: 8, width: 3, height: 5, rx: 0.8 }],
    ['path', { d: 'M10.5 17h3' }],
  ],
  share: [['path', { d: 'M12 3.5v11M8 7.5l4-4 4 4M8 11H6v9.5h12V11h-2' }]],
  copy: [
    ['rect', { x: 8.5, y: 8.5, width: 11, height: 11, rx: 2 }],
    ['path', { d: 'M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7.5V12l3 2' }],
  ],
  home: [['path', { d: 'M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z' }]],
  pill: [['path', { d: 'M4.9 13.4l8.5-8.5a4.2 4.2 0 0 1 5.9 5.9l-8.5 8.5a4.2 4.2 0 0 1-5.9-5.9zM9.2 9.2l5.6 5.6' }]],
  phone: [['path', { d: 'M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z' }]],
  external: [['path', { d: 'M13.5 4.5h6v6M19.5 4.5L11 13M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5' }]],
  eye: [
    ['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  lightning: [['path', { d: 'M13 3L5 13.5h6L10 21l8-10.5h-6z' }]],
  leaf: [['path', { d: 'M5 19c0-8 5-13.5 14.5-14-.3 9.5-6 14.5-14 14zM5 19l7-7' }]],
  // « Ciel de Lune » : soleil posé sur l'horizon (onglet Aujourd'hui, reprend le héros).
  sunrise: [
    ['path', { d: 'M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0' }],
    ['path', { d: 'M12 5.2v2.4M5.6 8.4l1.6 1.6M18.4 8.4l-1.6 1.6M8 20.8h8' }],
  ],
  // Bouée : Urgence (jamais le bouclier, réservé à « protection nécessaire »).
  buoy: [
    ['circle', { cx: 12, cy: 12, r: 8.6 }],
    ['circle', { cx: 12, cy: 12, r: 3.6 }],
    ['path', { d: 'M5.9 5.9l3.5 3.5M14.6 14.6l3.5 3.5M18.1 5.9l-3.5 3.5M9.4 14.6l-3.5 3.5' }],
  ],
  // Étoile à 4 branches (décor, point d'or).
  star: [['path', { d: 'M12 3c.9 5.2 2.8 7.1 8 8-5.2.9-7.1 2.8-8 8-.9-5.2-2.8-7.1-8-8 5.2-.9 7.1-2.8 8-8z' }]],
  crescent: [['path', { d: 'M15.5 4.4a8 8 0 1 0 4.1 13.1A6.6 6.6 0 0 1 15.5 4.4z' }]],
  // Prévision : horloge au contour pointillé (même code que les cases prévues).
  forecast: [
    ['circle', { cx: 12, cy: 12, r: 8.6, strokeDasharray: '2.2 2.6' }],
    ['path', { d: 'M12 7.4V12l3.2 2' }],
  ],
  // Protection jusqu'à 18 h : moitié de bouclier puis coche.
  mixed: [
    ['path', { d: 'M10.5 3.6L4.8 6v5.2c0 4.2 2.7 7.7 6.6 9.2' }],
    ['path', { d: 'M10.5 3.6L16.2 6v2.6' }],
    ['path', { d: 'M13.6 16l2.6 2.6 4.6-5.2' }],
  ],
};

/** Noms d'icônes disponibles (ceux du contrat §6.3, plus « help »). */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/**
 * Pictogramme SVG inline, couleur `currentColor`.
 * Décoratif (aria-hidden) sauf si `label` est fourni (role="img" + aria-label).
 * Un nom inconnu donne un SVG vide (jamais d'exception).
 *
 * @param {string} name   Nom (voir ICON_NAMES).
 * @param {{ size?: number, label?: string }} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 20, label } = {}) {
  const shapes = ICONS[name] || [];
  const svg = h('svg', {
    class: ['icon', `icon--${name}`],
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    focusable: 'false',
    role: label ? 'img' : null,
    ariaLabel: label || null,
    ariaHidden: label ? null : 'true',
  }, shapes.map(([tag, attrs]) => h(tag, attrs)));
  return svg;
}

/* ------------------------------------------------------------------ */
/* Dates locales (privées, indépendantes de engine/dates.js)          */
/* ------------------------------------------------------------------ */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' → millisecondes UTC à minuit (null si invalide). */
function isoToUTC(iso) {
  const m = typeof iso === 'string' ? ISO_RE.exec(iso) : null;
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

const pad2 = (n) => String(n).padStart(2, '0');

function utcToIso(t) {
  const d = new Date(t);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Ajoute n jours calendaires à une date locale (sans effet du changement d'heure).
 * @param {string} iso 'YYYY-MM-DD'
 * @param {number} n   entier (négatif accepté)
 * @returns {string|null} 'YYYY-MM-DD', ou null si la date est invalide
 */
export function addDays(iso, n) {
  const t = isoToUTC(iso);
  if (t === null) return null;
  return utcToIso(t + Math.trunc(n) * DAY_MS);
}

/**
 * Nombre de jours calendaires de `fromIso` à `toIso` (toIso − fromIso).
 * diffDays('2026-10-04', '2026-10-05') === 1.
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number|null} null si une date est invalide
 */
export function diffDays(fromIso, toIso) {
  const a = isoToUTC(fromIso);
  const b = isoToUTC(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Date et heure locales de l'appareil.
 * @param {Date} [date] instant à convertir (défaut : maintenant)
 * @returns {{ today: string, time: string }} { today: 'YYYY-MM-DD', time: 'HH:MM' }
 */
export function todayParts(date = new Date()) {
  return {
    today: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

/* ------------------------------------------------------------------ */
/* Formatage français                                                  */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKDAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Espace insécable utilisée entre une valeur et son unité. */
const NBSP = ' ';

/**
 * Date en français.
 * - 'long'    « samedi 4 octobre »
 * - 'court'   « 4 oct. »
 * - 'jour'    « sam. 4 »
 * - 'complet' « samedi 4 octobre 2026 »
 * - 'mois'    « octobre 2026 »
 * Le 1er du mois s'écrit « 1er ». Date invalide → « — ».
 *
 * @param {string} iso 'YYYY-MM-DD'
 * @param {'long'|'court'|'jour'|'complet'|'mois'} [style]
 * @returns {string}
 */
export function fmtDate(iso, style = 'long') {
  const t = isoToUTC(iso);
  if (t === null) return '—';
  const d = new Date(t);
  const day = d.getUTCDate();
  const dayStr = day === 1 ? '1er' : String(day);
  const wd = d.getUTCDay();
  const mo = d.getUTCMonth();
  const y = d.getUTCFullYear();
  switch (style) {
    case 'court': return `${dayStr}${NBSP}${MONTHS_SHORT[mo]}`;
    case 'jour': return `${WEEKDAYS_SHORT[wd]}${NBSP}${dayStr}`;
    case 'complet': return `${WEEKDAYS[wd]} ${dayStr} ${MONTHS[mo]} ${y}`;
    case 'mois': return `${MONTHS[mo]} ${y}`;
    default: return `${WEEKDAYS[wd]} ${dayStr} ${MONTHS[mo]}`;
  }
}

function isTemp(c) {
  return typeof c === 'number' && Number.isFinite(c);
}

/**
 * Température en centièmes entiers → « 36,47 »  (null → « — »).
 * @param {number|null} c ex. 3647
 * @returns {string}
 */
export function fmtTempShort(c) {
  if (!isTemp(c)) return '—';
  const v = Math.round(c);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}${Math.floor(abs / 100)},${pad2(abs % 100)}`;
}

/**
 * Température en centièmes entiers → « 36,47 °C » (espace insécable ; null → « — »).
 * @param {number|null} c ex. 3647
 * @returns {string}
 */
export function fmtTemp(c) {
  if (!isTemp(c)) return '—';
  return `${fmtTempShort(c)}${NBSP}°C`;
}

/**
 * Accord en nombre, règle française (0 et 1 au singulier). Renvoie le MOT seul.
 * plural(1, 'jour', 'jours') → 'jour' ; plural(3, 'jour', 'jours') → 'jours'.
 * Usage : `${n} ${plural(n, 'jour', 'jours')}`.
 * @param {number} n
 * @param {string} sing
 * @param {string} [plur] défaut : sing + 's'
 * @returns {string}
 */
export function plural(n, sing, plur = `${sing}s`) {
  return Math.abs(n) >= 2 ? plur : sing;
}

/* ------------------------------------------------------------------ */
/* Métadonnées d'affichage                                             */
/* ------------------------------------------------------------------ */

/**
 * États de fertilité (spec §2.6). `cls` est un suffixe de ton : classes `badge--{cls}`
 * et `tone-{cls}` (cette dernière expose --tone, --tone-soft, --hatch-color).
 * `fertile` : traitement du jour (true = à considérer fertile).
 */
export const STATE_META = Object.freeze({
  FERTILE: {
    label: 'Fertile : protection nécessaire',
    short: 'Fertile',
    icon: 'shield',
    cls: 'fertile',
    fertile: true,
  },
  INDETERMINE: {
    label: 'Pas assez de données : considérer comme fertile',
    short: 'Pas assez de données',
    icon: 'help',
    cls: 'unknown',
    fertile: true,
  },
  FERTILE_JUSQU_A_18H: {
    label: 'Fertile jusqu\'à ce soir 18 h, puis infertile (double contrôle)',
    short: 'Fertile jusqu\'à 18 h',
    icon: 'clock',
    cls: 'transition',
    fertile: true,
  },
  INFERTILE_PRE: {
    label: 'Infertile en début de cycle (règle des 5 jours / moins 8), sauf apparition de glaire',
    short: 'Infertile (début de cycle)',
    icon: 'check',
    cls: 'safe-pre',
    fertile: false,
  },
  INFERTILE_POST: {
    label: 'Infertile jusqu\'aux prochaines règles (double contrôle confirmé)',
    short: 'Infertile (double contrôle)',
    icon: 'check',
    cls: 'safe',
    fertile: false,
  },
});

/** Décision finale du jour (spec §2.6). Clé : protectionNeeded ? 'protection' : 'libre'. */
export const DECISION_META = Object.freeze({
  protection: {
    label: 'Protection nécessaire',
    icon: 'shield',
    cls: 'fertile',
    note: 'Préservatif ou abstinence pour tout rapport.',
  },
  libre: {
    label: 'Pas de protection nécessaire selon les règles',
    icon: 'check',
    cls: 'safe',
    note: 'Vérifie la plausibilité de tes données.',
  },
});

/** Phases (indicatives, pour l'affichage uniquement). */
export const PHASE_META = Object.freeze({
  regles: {
    label: 'Règles',
    short: 'Règles',
    icon: 'drop',
    text: 'La muqueuse de l\'utérus s\'élimine. Les règles durent en général 2 à 8 jours.',
  },
  folliculaire: {
    label: 'Phase folliculaire',
    short: 'Folliculaire',
    icon: 'leaf',
    text: 'L\'œstradiol monte et la glaire apparaît. C\'est la phase la plus variable d\'un cycle à l\'autre.',
  },
  ovulatoire: {
    label: 'Autour de l\'ovulation',
    short: 'Ovulatoire',
    icon: 'egg',
    text: 'La glaire atteint sa meilleure qualité, l\'ovulation est proche. Repère indicatif.',
  },
  luteale: {
    label: 'Phase lutéale',
    short: 'Lutéale',
    icon: 'thermo',
    text: 'Après l\'ovulation, la progestérone fait monter la température de 0,2 à 0,5 °C.',
  },
  inconnue: {
    label: 'Phase inconnue',
    short: 'Inconnue',
    icon: 'help',
    text: 'Pas encore assez de données pour situer la phase.',
  },
});

/** Surcouches affichées en plus de l'état (DayStatus.overlays). */
export const OVERLAY_META = Object.freeze({
  regles: { label: 'Règles', icon: 'drop', cls: 'period' },
  spotting: { label: 'Spotting', icon: 'drop', cls: 'period' },
  post_retrait: { label: 'Saignement après le retrait', icon: 'drop', cls: 'period' },
  apprentissage: { label: 'Cycle d\'apprentissage', icon: 'book', cls: 'brand' },
  strict: { label: 'Mode strict FSRH', icon: 'lock', cls: 'brand' },
  cu: { label: 'Contraception d\'urgence en cours', icon: 'pill', cls: 'fertile' },
  cas_limite: { label: 'Cas limite', icon: 'alert', cls: 'unknown' },
  douteux_lh: { label: 'Évaluation douteuse (LH)', icon: 'flask', cls: 'unknown' },
  cycle0: { label: 'Cycle 0', icon: 'moon', cls: 'unknown' },
  non_evaluable: { label: 'Non évaluable', icon: 'x', cls: 'unknown' },
  a_confirmer: { label: 'À confirmer', icon: 'help', cls: 'unknown' },
});

/* ------------------------------------------------------------------ */
/* Composants légers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Badge d'état : couleur + icône + texte (jamais la couleur seule).
 * Accepte un DayStatus (ou une chaîne d'état). État absent/inconnu → INDETERMINE.
 * Le motif (`stateReason`) est repris en info-bulle.
 *
 * @param {{ state: string, stateReason?: string }|string|null} dayStatus
 * @returns {HTMLSpanElement}
 */
export function statusBadge(dayStatus) {
  const state = typeof dayStatus === 'string' ? dayStatus : dayStatus && dayStatus.state;
  const meta = STATE_META[state] || STATE_META.INDETERMINE;
  const reason = dayStatus && typeof dayStatus === 'object' ? dayStatus.stateReason : null;
  // S1 : un jour infertile selon les règles mais où la protection reste nécessaire
  // (apprentissage, mode strict, cycle 0…) est peint comme « protection », jamais comme « sans protection ».
  if (dayStatus && typeof dayStatus === 'object') {
    const look = decisionLook(dayStatus);
    if (look.held) {
      return h('span', {
        class: ['badge', 'badge--held'],
        title: look.aria,
        ariaLabel: look.aria,
      }, icon('shield', { size: 16 }), h('span', {}, `${meta.short} · protection`));
    }
  }
  return h('span', {
    class: ['badge', `badge--${meta.cls}`],
    title: reason || meta.label,
  }, icon(meta.icon, { size: 16 }), h('span', {}, meta.short));
}

/* ------------------------------------------------------------------ */
/* Apparence d'un jour selon la DÉCISION (règles de sécurité S1–S3)    */
/* ------------------------------------------------------------------ */

/** Motif court d'une protection « retenue » (jour infertile selon les règles). */
function heldReason(status) {
  const ov = Array.isArray(status.overlays) ? status.overlays : [];
  if (ov.includes('cycle0')) return 'cycle 0';
  if (ov.includes('apprentissage')) return 'cycle d\'apprentissage';
  if (ov.includes('strict')) return 'mode strict';
  if (ov.includes('cu')) return 'contraception d\'urgence en cours';
  if (ov.includes('douteux_lh')) return 'évaluation douteuse (LH)';
  return 'blocage de sécurité';
}

/**
 * Comment peindre une case / pastille de jour : TOUJOURS selon la décision
 * (DayStatus.protectionNeeded), jamais selon l'état des règles seul (S1).
 * Fonction pure (sans DOM).
 *
 * - kind 'protect' : protection nécessaire (fertile, indéterminé, ou infertile « retenu ») →
 *   classes `st--protect` / `badge--protect`, icône bouclier, aplat chaud hachuré.
 * - kind 'mixed'   : protection jusqu'à 18 h puis infertile (double contrôle, sans blocage) →
 *   `st--mixed` / `badge--transition`, icône « mixed ».
 * - kind 'pre'     : pas de protection, infertile pré-ovulatoire par règle → `st--pre` / `badge--safe-pre`
 *   (bord PLEIN + coche cerclée, teinte plus claire ; jamais de tireté : S2).
 * - kind 'safe'    : pas de protection, infertile post-ovulatoire → `st--safe` / `badge--safe`.
 * `held` = l'état des règles est infertile mais la protection reste nécessaire : l'état des règles
 * n'apparaît alors que dans `aria` / `title` (« Infertile selon les règles : protection recommandée (…) »).
 * Les règles (saignement) ne changent jamais l'aspect : c'est un marqueur à part (`.dawn-bar`, S3).
 *
 * @param {{ state?: string, protectionNeeded?: boolean, eveningSwitch?: {blocked:boolean}|null, overlays?: string[] }|null} status
 * @returns {{ kind: 'protect'|'mixed'|'pre'|'safe', held: boolean, protect: boolean, icon: string,
 *   stCls: string, badgeCls: string, short: string, label: string, rulesLabel: string, aria: string }}
 */
export function decisionLook(status) {
  const s = status && typeof status === 'object' ? status : {};
  const meta = STATE_META[s.state] || STATE_META.INDETERMINE;
  const infertileByRules = s.state === 'INFERTILE_PRE' || s.state === 'INFERTILE_POST';
  const mixed = s.state === 'FERTILE_JUSQU_A_18H' && !!s.eveningSwitch && s.eveningSwitch.blocked === false;
  const free = s.protectionNeeded === false && infertileByRules;
  if (mixed) {
    return {
      kind: 'mixed', held: false, protect: true, icon: 'mixed', stCls: 'st--mixed', badgeCls: 'badge--transition',
      short: '→ 18 h', label: 'Protection nécessaire jusqu\'à 18 h', rulesLabel: meta.short,
      aria: 'Protection nécessaire jusqu\'à 18 h, puis pas de protection nécessaire selon les règles',
    };
  }
  if (free) {
    const pre = s.state === 'INFERTILE_PRE';
    return {
      kind: pre ? 'pre' : 'safe', held: false, protect: false, icon: 'check',
      stCls: pre ? 'st--pre' : 'st--safe', badgeCls: pre ? 'badge--safe-pre' : 'badge--safe',
      short: 'libre', label: DECISION_META.libre.label, rulesLabel: meta.short,
      aria: `${DECISION_META.libre.label} (${meta.short.toLowerCase()})`,
    };
  }
  // Tout le reste : protection (y compris donnée absente / inconnue).
  const held = infertileByRules || (s.state === 'FERTILE_JUSQU_A_18H' && !mixed);
  const aria = held
    ? `Infertile selon les règles : protection recommandée (${heldReason(s)})`
    : `${DECISION_META.protection.label} (${meta.short.toLowerCase()})`;
  return {
    kind: 'protect', held, protect: true, icon: 'shield', stCls: 'st--protect', badgeCls: held ? 'badge--held' : 'badge--protect',
    short: 'prot.', label: DECISION_META.protection.label, rulesLabel: meta.short, aria,
  };
}

/* ------------------------------------------------------------------ */
/* Ciel de Lune : lune, arc de ciel, logo (SVG construits avec h())     */
/* ------------------------------------------------------------------ */

/**
 * Noms de ciel par phase (décor du héros). Jamais le mot « règles » (discrétion, S7).
 * `token` : variable CSS de la couleur de segment.
 */
export const SKY_META = Object.freeze({
  regles: { sky: 'aube rosée', token: '--ph-regles' },
  folliculaire: { sky: 'matin abricot', token: '--ph-foll' },
  ovulatoire: { sky: 'plein soleil', token: '--ph-ovu' },
  luteale: { sky: 'crépuscule', token: '--ph-lut' },
  inconnue: { sky: 'ciel de nuit', token: '--ph-lut' },
});

const r2 = (n) => Math.round(n * 100) / 100;

/** Longueur de cycle utilisable (entier ≥ 2 ; 28 par défaut). */
function safeLength(len) {
  const n = Math.round(Number(len));
  return Number.isFinite(n) && n >= 2 ? Math.min(n, 120) : 28;
}

/** Jour de cycle borné à [1, len] (1 par défaut). */
function safeDay(day, len) {
  const n = Math.round(Number(day));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, len);
}

/**
 * Position dans le « mois lunaire » associée à un jour de cycle : 0 = nouvelle lune (J1),
 * 0,5 = pleine lune (milieu du cycle), → 1 = fin décroissante. Fonction pure.
 * @param {number} cycleDay  jour de cycle (≥ 1)
 * @param {number} [cycleLength=28]
 * @returns {number} f dans ]0, 1[
 */
export function moonFraction(cycleDay, cycleLength = 28) {
  const len = safeLength(cycleLength);
  const d = safeDay(cycleDay, len);
  return ((d - 1) + 0.5) / len;
}

/**
 * Nom de la forme de lune pour f (0 = nouvelle, 0,5 = pleine).
 * @param {number} f
 * @returns {string}
 */
export function moonShapeName(f) {
  const x = ((Number(f) % 1) + 1) % 1;
  if (x < 0.0625 || x >= 0.9375) return 'nouvelle lune';
  if (x < 0.1875) return 'premier croissant';
  if (x < 0.3125) return 'premier quartier';
  if (x < 0.4375) return 'lune gibbeuse croissante';
  if (x < 0.5625) return 'pleine lune';
  if (x < 0.6875) return 'lune gibbeuse décroissante';
  if (x < 0.8125) return 'dernier quartier';
  return 'dernier croissant';
}

/**
 * Tracé de la partie éclairée de la lune (repris de tools-ciel/gen.mjs). Fonction pure.
 * f < 0,5 : croissante, éclairée à droite ; f ≥ 0,5 : décroissante, éclairée à gauche.
 * @param {number} cx @param {number} cy @param {number} r @param {number} f dans [0, 1[
 * @returns {string} attribut d
 */
export function moonPath(cx, cy, r, f) {
  const t = Math.cos(2 * Math.PI * f);
  const rx = r2(Math.abs(t) * r);
  const top = `${r2(cx)} ${r2(cy - r)}`;
  const bot = `${r2(cx)} ${r2(cy + r)}`;
  if (f < 0.5) {
    const sw = t > 0 ? 0 : 1;
    return `M${top}A${r} ${r} 0 0 1 ${bot}A${rx} ${r} 0 0 ${sw} ${top}Z`;
  }
  const sw = t < 0 ? 0 : 1;
  return `M${top}A${r} ${r} 0 0 0 ${bot}A${rx} ${r} 0 0 ${sw} ${top}Z`;
}

/** Point d'un cercle (angle a en radians, y vers le haut). */
function arcPoint(cx, cy, R, a) {
  return [r2(cx + R * Math.cos(a)), r2(cy - R * Math.sin(a))];
}

/**
 * Arc de cercle de a0 à a1 (sens horaire à l'écran, a0 > a1). Fonction pure.
 * @returns {string} attribut d
 */
export function arcPath(cx, cy, R, a0, a1) {
  const [x0, y0] = arcPoint(cx, cy, R, a0);
  const [x1, y1] = arcPoint(cx, cy, R, a1);
  return `M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}`;
}

const SKY_W = 343;
const SKY_H = 262;
const SKY_CY = 214; // horizon à 81,7 % de la hauteur (aligné sur le dégradé --sky)
const SKY_R = 128;
const SKY_STARS = [[34, 58, 1.4], [64, 30, 1], [118, 52, 1.2], [210, 26, 1.1], [292, 44, 1.5], [318, 92, 1], [26, 120, 0.9], [150, 22, 0.8], [262, 70, 0.9], [96, 92, 0.8]];
const PHASE_ORDER = ['regles', 'folliculaire', 'ovulatoire', 'luteale'];

/**
 * Géométrie de l'arc de ciel (fonction pure, testable sans DOM).
 * Le cycle va de l'horizon gauche (J1) à l'horizon droit (dernier jour) ; jours passés pleins,
 * jours à venir en pointillés (prévision) ; la lune est posée au milieu du jour courant.
 * @param {{ cycleDay: number, cycleLength?: number, phases?: Array<{phase: string, from: number, to: number}> }} p
 * @returns {{ len: number, day: number, segments: Array<{phase: string, d: string, future: boolean}>,
 *   ticks: Array<{x: number, y: number, r: number, today: boolean, future: boolean}>, moon: {x: number, y: number, r: number, f: number},
 *   track: string, horizonY: number, width: number, height: number }}
 */
export function skyArcGeometry({ cycleDay, cycleLength = 28, phases = [] } = {}) {
  // Un cycle plus long que prévu allonge l'arc : la lune ne passe jamais sous l'horizon.
  const len = effectiveLength(cycleDay, cycleLength);
  const day = safeDay(cycleDay, len);
  const cx = SKY_W / 2;
  const ang = (d) => Math.PI - ((d - 1) / len) * Math.PI;
  const gap = 0.026;
  const segments = [];
  const list = (Array.isArray(phases) ? phases : [])
    .filter((p) => p && PHASE_ORDER.includes(p.phase) && Number.isFinite(p.from) && Number.isFinite(p.to))
    .map((p) => ({ phase: p.phase, from: Math.max(1, Math.round(p.from)), to: Math.min(len, Math.round(p.to)) }))
    .filter((p) => p.to >= p.from)
    .sort((a, b) => a.from - b.from);
  for (const p of list) {
    const a0 = ang(p.from) - (p.from === 1 ? 0 : gap / 2);
    const a1 = ang(p.to + 1) + (p.to === len ? 0 : gap / 2);
    if (day >= p.to) segments.push({ phase: p.phase, d: arcPath(cx, SKY_CY, SKY_R, a0, a1), future: false });
    else if (day < p.from) segments.push({ phase: p.phase, d: arcPath(cx, SKY_CY, SKY_R, a0, a1), future: true });
    else {
      const am = ang(day + 0.5);
      segments.push({ phase: p.phase, d: arcPath(cx, SKY_CY, SKY_R, a0, am), future: false });
      segments.push({ phase: p.phase, d: arcPath(cx, SKY_CY, SKY_R, am, a1), future: true });
    }
  }
  const ticks = [];
  for (let d = 1; d <= len; d++) {
    const [x, y] = arcPoint(cx, SKY_CY, SKY_R - 13, ang(d + 0.5));
    ticks.push({ x, y, r: d % 7 === 0 ? 1.8 : 1.1, today: d === day, future: d > day });
  }
  const [mx, my] = arcPoint(cx, SKY_CY, SKY_R, ang(day + 0.5));
  return {
    len, day, segments, ticks,
    moon: { x: mx, y: my, r: 17, f: moonFraction(day, len) },
    track: arcPath(cx, SKY_CY, SKY_R, Math.PI, 0),
    horizonY: SKY_CY, width: SKY_W, height: SKY_H,
  };
}

/** Groupe SVG d'une lune (halo facultatif, disque sombre, partie éclairée). */
function moonGroup(cx, cy, r, f, halo = true) {
  return h('g', { class: 'moon' },
    halo ? h('circle', { class: 'moon__halo', cx: r2(cx), cy: r2(cy), r: r2(r * 1.9) }) : null,
    halo ? h('circle', { class: 'moon__halo moon__halo--near', cx: r2(cx), cy: r2(cy), r: r2(r * 1.35) }) : null,
    h('circle', { class: 'moon__dark', cx: r2(cx), cy: r2(cy), r }),
    h('path', { class: 'moon__lit', d: moonPath(cx, cy, r, f) }));
}

/** Longueur effective : un cycle plus long que prévu allonge l'échelle (jamais de dépassement). */
function effectiveLength(cycleDay, cycleLength) {
  const raw = Math.round(Number(cycleDay));
  return Math.max(safeLength(cycleLength), Number.isFinite(raw) ? Math.min(raw, 120) : 0);
}

/**
 * Lune dont la forme suit le jour du cycle : nouvelle au J1, pleine vers le milieu, décroissante ensuite.
 * Couleurs : --moon, --moon-glow, --moon-line (classes .moon__*, voir css/app.css).
 * @param {number} cycleDay
 * @param {number} [cycleLength=28]
 * @param {{ size?: number, label?: string|null, halo?: boolean }} [opts] label null → décorative (aria-hidden)
 * @returns {SVGSVGElement}
 */
export function moonSvg(cycleDay, cycleLength = 28, { size = 48, label, halo = true } = {}) {
  const len = effectiveLength(cycleDay, cycleLength);
  const day = safeDay(cycleDay, len);
  const f = moonFraction(day, len);
  const text = label === undefined ? `Lune du jour ${day} : ${moonShapeName(f)}` : label;
  return h('svg', {
    class: 'moon-svg',
    viewBox: '0 0 48 48',
    width: size,
    height: size,
    focusable: 'false',
    role: text ? 'img' : null,
    ariaLabel: text || null,
    ariaHidden: text ? null : 'true',
  }, moonGroup(24, 24, halo ? 12 : 21, f, halo));
}

/**
 * Arc de ciel du héros : 4 segments de phase (couleurs --ph-*), jours passés pleins,
 * jours à venir en pointillés, graduations, horizon, étoiles, lune au jour courant.
 * Le fond (dégradé de ciel) n'est PAS dans le SVG : le conteneur porte `.sky` (background: var(--sky)).
 * viewBox 343 × 262, horizon à y = 214 (81,7 %) : donner au conteneur `aspect-ratio: 343 / 262`
 * (ou la même proportion) pour que l'horizon du SVG tombe sur celui du dégradé.
 * @param {{ cycleDay: number, cycleLength?: number, phases?: Array<{phase: string, from: number, to: number}>,
 *   size?: number|string, label?: string|null, phase?: string }} p  size = largeur (défaut '100%')
 * @returns {SVGSVGElement}
 */
export function skyArcSvg({ cycleDay, cycleLength = 28, phases = [], size = '100%', label, phase } = {}) {
  const geo = skyArcGeometry({ cycleDay, cycleLength, phases });
  const current = phase && SKY_META[phase] ? phase : phaseOfDay(phases, geo.day);
  const sky = (SKY_META[current] || SKY_META.inconnue).sky;
  const text = label === undefined
    ? `Ciel du cycle : jour ${geo.day} sur ${geo.len} environ, ${sky} ; ${moonShapeName(geo.moon.f)}`
    : label;
  return h('svg', {
    class: 'sky-arc',
    viewBox: `0 0 ${geo.width} ${geo.height}`,
    width: size,
    preserveAspectRatio: 'xMidYMid meet',
    focusable: 'false',
    role: text ? 'img' : null,
    ariaLabel: text || null,
    ariaHidden: text ? null : 'true',
  },
  h('g', { class: 'sky-arc__stars' },
    SKY_STARS.map(([x, y, r]) => h('circle', { class: 'sky-arc__star', cx: x, cy: y, r }))),
  h('path', { class: 'sky-arc__track', d: geo.track }),
  h('path', { class: 'sky-arc__under', d: geo.track }),
  geo.segments.map((s) => h('path', {
    class: ['sky-arc__seg', `sky-arc__seg--${s.phase}`, s.future && 'sky-arc__seg--future'],
    d: s.d,
  })),
  h('g', { class: 'sky-arc__ticks' },
    geo.ticks.map((t) => h('circle', {
      class: ['sky-arc__tick', t.today && 'sky-arc__tick--today', t.future && 'sky-arc__tick--future'],
      cx: t.x, cy: t.y, r: t.r,
    }))),
  h('line', { class: 'sky-arc__horizon', x1: 0, y1: geo.horizonY, x2: geo.width, y2: geo.horizonY }),
  moonGroup(geo.moon.x, geo.moon.y, geo.moon.r, geo.moon.f));
}

/** Phase couvrant un jour donné dans une liste [{phase, from, to}] ('inconnue' sinon). */
function phaseOfDay(phases, day) {
  const p = (Array.isArray(phases) ? phases : []).find((x) => x && day >= x.from && day <= x.to);
  return p && SKY_META[p.phase] ? p.phase : 'inconnue';
}

/**
 * Logo de Lune (version simplifiée, lisible de 32 à 512 px) décrit comme un arbre
 * { tag, attrs, children } : source unique pour l'en-tête (logoSvg) et les icônes (tools/make_icons.mjs).
 * Variantes : 'rounded' (carré arrondi, coins transparents), 'full' (fond plein, apple-touch-icon),
 * 'maskable' (fond plein, motif réduit à 80 % au centre = zone sûre).
 * @param {{ variant?: 'rounded'|'full'|'maskable', id?: string }} [opts] id : préfixe des identifiants internes
 * @returns {{ tag: string, attrs: object, children: Array }}
 */
export function logoSpec({ variant = 'rounded', id = 'lune' } = {}) {
  const n = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
  const stop = (offset, color, opacity) => n('stop', { offset, 'stop-color': color, ...(opacity !== undefined ? { 'stop-opacity': opacity } : {}) });
  const motif = [
    n('circle', { cx: 232, cy: 262, r: 236, fill: `url(#${id}-glow)` }),
    n('path', {
      d: 'M60 446A196 196 0 0 1 452 446', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.5,
      'stroke-width': 24, 'stroke-linecap': 'round', 'stroke-dasharray': '0.5 47.5',
    }),
    n('circle', { cx: 232, cy: 262, r: 172, fill: `url(#${id}-moon)`, mask: `url(#${id}-cut)` }),
    n('path', { d: 'M372 106c5.6 40 20 54.4 60 60-40 5.6-54.4 20-60 60-5.6-40-20-54.4-60-60 40-5.6 54.4-20 60-60z', fill: '#fff4d6' }),
  ];
  const motifGroup = variant === 'maskable'
    ? n('g', { transform: 'translate(51.2 51.2) scale(0.8)' }, motif)
    : n('g', {}, motif);
  const body = [n('rect', { width: 512, height: 512, fill: `url(#${id}-sky)` }), motifGroup];
  const defs = n('defs', {}, [
    n('linearGradient', { id: `${id}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
      stop(0, '#2a2373'), stop(0.45, '#4e3aa8'), stop(0.76, '#a5528f'), stop(1, '#f79a62'),
    ]),
    n('radialGradient', { id: `${id}-glow`, cx: 232, cy: 262, r: 236, gradientUnits: 'userSpaceOnUse' }, [
      stop(0, '#ffd98a', 0.5), stop(0.5, '#ffb070', 0.16), stop(1, '#ffb070', 0),
    ]),
    n('linearGradient', { id: `${id}-moon`, x1: 0, y1: 0, x2: 1, y2: 1 }, [
      stop(0, '#fff7df'), stop(0.55, '#ffe6a6'), stop(1, '#ffc861'),
    ]),
    n('mask', { id: `${id}-cut` }, [
      n('rect', { width: 512, height: 512, fill: '#fff' }),
      n('circle', { cx: 334, cy: 190, r: 146, fill: '#000' }),
    ]),
    ...(variant === 'rounded' ? [n('clipPath', { id: `${id}-sq` }, [n('rect', { width: 512, height: 512, rx: 114 })])] : []),
  ]);
  const content = variant === 'rounded' ? [n('g', { 'clip-path': `url(#${id}-sq)` }, body)] : body;
  return n('svg', { viewBox: '0 0 512 512', width: 512, height: 512 }, [defs, ...content]);
}

let logoUid = 0;

/**
 * Logo inline (en-tête). Décoratif par défaut (le nom « Lune » est écrit à côté).
 * @param {{ size?: number, label?: string }} [opts]
 * @returns {SVGSVGElement}
 */
export function logoSvg({ size = 34, label } = {}) {
  const spec = logoSpec({ variant: 'rounded', id: `lune-logo-${++logoUid}` });
  const build = (node) => h(node.tag, node.attrs, (node.children || []).map(build));
  const svg = build(spec);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'logo');
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/**
 * Découpe une chaîne « **gras** » en segments (fonction pure).
 * Un « ** » non refermé est conservé tel quel.
 * @param {string} str
 * @returns {Array<{ text: string, bold: boolean }>}
 */
export function parseRich(str) {
  const s = str === null || str === undefined ? '' : String(str);
  const out = [];
  const re = /\*\*(.+?)\*\*/gs;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

/**
 * Texte enrichi minimal : « **gras** » → <strong>. Construit sans innerHTML.
 * @param {string} str
 * @returns {DocumentFragment}
 */
export function richText(str) {
  const frag = document.createDocumentFragment();
  for (const seg of parseRich(str)) {
    frag.appendChild(seg.bold ? h('strong', {}, seg.text) : document.createTextNode(seg.text));
  }
  return frag;
}

/* ------------------------------------------------------------------ */
/* Listes d'options de saisie — [{ id, label, hint }]                 */
/* ------------------------------------------------------------------ */

/** Saignements. Seules les règles légères/moyennes/abondantes peuvent ouvrir un cycle (avec confirmation). */
export const BLEEDING_LEVELS = Object.freeze([
  { id: 'spotting', label: 'Spotting', hint: 'Quelques traces. Ne démarre jamais un cycle.' },
  { id: 'leger', label: 'Règles légères', hint: '' },
  { id: 'moyen', label: 'Règles moyennes', hint: '' },
  { id: 'abondant', label: 'Règles abondantes', hint: '' },
  { id: 'post_retrait', label: 'Saignement après le retrait', hint: 'Provoqué par le retrait du DIU : ne compte pas comme premier jour de règles.' },
]);

/** Glaire — sensation à l'entrée du vagin (spec §2.3.1). `code` / `value` : notation Sensiplan. */
export const MUCUS_SENSATIONS = Object.freeze([
  { id: 'sec', label: 'Sec / rêche', hint: 'Sécheresse, rêche, démangeaison, désagréable.', code: 't', value: 0 },
  { id: 'rien', label: 'Rien senti', hint: 'Pas d\'humidité.', code: '∅', value: 1 },
  { id: 'humide', label: 'Humide', hint: 'Sensation d\'humidité, sans glisser.', code: 'f', value: 2 },
  { id: 'mouille', label: 'Mouillé / glissant', hint: 'Glissant, comme huilé, doux, lisse. Compte même si tu ne vois rien.', code: 'S+', value: 4 },
]);

/** Glaire — aspect (spec §2.3.1). « Rien vu » seul, sans sensation, ne suffit pas. */
export const MUCUS_ASPECTS = Object.freeze([
  { id: 'rien', label: 'Rien vu', hint: 'Note aussi la sensation : l\'aspect seul ne suffit pas.', code: null, value: null },
  { id: 'epaisse', label: 'Épaisse, crémeuse, collante', hint: 'Blanchâtre, trouble, grumeleuse, jaunâtre, laiteuse, non étirable.', code: 'S', value: 3 },
  { id: 'filante', label: 'Transparente, filante, blanc d\'œuf (ou rougeâtre)', hint: 'Vitreuse, étirable, liquide, ou rougeâtre / brun-rouge.', code: 'S+', value: 4 },
]);

/** Motifs de perturbation de la température (spec §2.2.3). */
export const TEMP_DISTURBANCES = Object.freeze([
  { id: 'maladie', label: 'Fièvre ou maladie', hint: 'Le motif suffit : tu n\'es pas obligée de saisir la valeur.' },
  { id: 'alcool', label: 'Alcool', hint: '' },
  { id: 'nuit_courte', label: 'Nuit courte ou sommeil perturbé', hint: '' },
  { id: 'heure_inhabituelle', label: 'Heure inhabituelle', hint: '' },
  { id: 'voyage', label: 'Décalage horaire ou voyage', hint: '' },
  { id: 'stress', label: 'Stress important', hint: '' },
  { id: 'medicament', label: 'Médicament', hint: 'Antalgique, antihistaminique, remède contre le rhume, cortisone…' },
  { id: 'autre', label: 'Autre', hint: 'Précise dans la note.' },
]);

/** Voies de mesure (une seule par cycle). */
export const TEMP_ROUTES = Object.freeze([
  { id: 'buccale', label: 'Buccale', hint: 'Sous la langue, bouche fermée, 5 minutes.' },
  { id: 'vaginale', label: 'Vaginale', hint: 'Recommandée, au moins 3 minutes.' },
  { id: 'rectale', label: 'Rectale', hint: 'Recommandée, au moins 3 minutes.' },
]);

/** Col de l'utérus — ouverture (spec §2.3.3). */
export const CERVIX_OPENING = Object.freeze([
  { id: 'ferme', label: 'Fermé', hint: '' },
  { id: 'mi_ouvert', label: 'Mi-ouvert', hint: '' },
  { id: 'ouvert', label: 'Ouvert', hint: '' },
]);

/** Col de l'utérus — fermeté. */
export const CERVIX_FIRMNESS = Object.freeze([
  { id: 'dur', label: 'Dur', hint: 'Ferme, comme le bout du nez.' },
  { id: 'mou', label: 'Mou', hint: 'Souple, comme les lèvres.' },
]);

/** Col de l'utérus — position (facultative, ignorée par le calcul). */
export const CERVIX_POSITION = Object.freeze([
  { id: 'bas', label: 'Bas', hint: '' },
  { id: 'moyen', label: 'Moyen', hint: '' },
  { id: 'haut', label: 'Haut', hint: '' },
]);

/** Test LH (rôle secondaire, ne rend jamais un jour infertile). */
export const LH_RESULTS = Object.freeze([
  { id: 'negatif', label: 'Négatif', hint: '' },
  { id: 'positif', label: 'Positif', hint: '' },
]);

/** Test de grossesse. */
export const PREGNANCY_TEST_RESULTS = Object.freeze([
  { id: 'negatif', label: 'Négatif', hint: '' },
  { id: 'positif', label: 'Positif', hint: '' },
]);

/** Rapports. */
export const SEX_OPTIONS = Object.freeze([
  { id: 'protege', label: 'Protégé', hint: '' },
  { id: 'non_protege', label: 'Non protégé', hint: '' },
  { id: 'incident', label: 'Incident de préservatif', hint: 'Rompu ou glissé.' },
]);

/** Contraception d'urgence prise (spec §6.3). */
export const EMERGENCY_CONTRACEPTIONS = Object.freeze([
  { id: 'levonorgestrel', label: 'Lévonorgestrel 1,5 mg', hint: 'Jusqu\'à 72 h après le rapport.' },
  { id: 'ulipristal', label: 'Ulipristal 30 mg', hint: 'Jusqu\'à 120 h après le rapport.' },
  { id: 'diu_cuivre', label: 'DIU au cuivre', hint: 'Jusqu\'à 120 h après le premier rapport à risque du cycle.' },
]);

/** Événements qui rendent le cycle atypique (exclu des prévisions et statistiques). */
export const CYCLE_EVENTS = Object.freeze([
  { id: 'maladie', label: 'Maladie', hint: '' },
  { id: 'voyage', label: 'Voyage', hint: '' },
  { id: 'stress_majeur', label: 'Stress majeur', hint: '' },
  { id: 'nouveau_medicament', label: 'Nouveau médicament', hint: '' },
  { id: 'fausse_couche', label: 'Fausse couche', hint: '' },
]);

/** Symptômes (journal libre). */
export const SYMPTOMS = Object.freeze([
  { id: 'crampes', label: 'Crampes' },
  { id: 'maux_tete', label: 'Maux de tête' },
  { id: 'ballonnements', label: 'Ballonnements' },
  { id: 'seins_sensibles', label: 'Seins sensibles' },
  { id: 'acne', label: 'Acné' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'nausees', label: 'Nausées' },
  { id: 'mal_dos', label: 'Mal de dos' },
  { id: 'transit', label: 'Transit perturbé' },
  { id: 'fringales', label: 'Fringales' },
  { id: 'insomnie', label: 'Insomnie' },
  { id: 'libido_haute', label: 'Libido haute' },
  { id: 'libido_basse', label: 'Libido basse' },
  { id: 'douleur_ovulation', label: 'Douleur d\'ovulation' },
  { id: 'douleur_rapports', label: 'Douleur pendant les rapports' },
  { id: 'douleur_digestive', label: 'Douleur digestive' },
  { id: 'douleur_urinaire', label: 'Douleur en urinant' },
  { id: 'vertiges', label: 'Vertiges' },
]);

/** Humeurs (journal libre). */
export const MOODS = Object.freeze([
  { id: 'calme', label: 'Calme' },
  { id: 'joyeuse', label: 'Joyeuse' },
  { id: 'energique', label: 'Énergique' },
  { id: 'irritable', label: 'Irritable' },
  { id: 'anxieuse', label: 'Anxieuse' },
  { id: 'triste', label: 'Triste' },
  { id: 'sensible', label: 'Sensible' },
  { id: 'deprimee', label: 'Déprimée' },
  { id: 'concentree', label: 'Concentrée' },
  { id: 'sautes_humeur', label: 'Sautes d\'humeur' },
]);
