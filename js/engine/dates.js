// Utilitaires de dates du moteur.
//
// Les jours sont des chaînes locales 'YYYY-MM-DD' : l'arithmétique se fait sur des
// numéros de jour calculés via Date.UTC, jamais via l'heure locale de l'appareil,
// ce qui évite tout effet de fuseau ou de changement d'heure.
//
// Les délais en heures (contraception d'urgence, J+21…) se calculent en minutes
// absolues : une date + heure civile de Europe/Paris est convertie en instant UTC
// avec le décalage réellement en vigueur ce jour-là (Intl.DateTimeFormat avec
// timeZone 'Europe/Paris' ; repli sur la règle européenne de l'heure d'été si
// Intl ne connaît pas le fuseau). Heure ambiguë (passage à l'heure d'hiver,
// 02:00–02:59 vécu deux fois) : on retient la 1re occurrence, la plus précoce,
// pour qu'un délai calculé depuis cette heure ne soit jamais trop tardif.
// Heure inexistante (passage à l'heure d'été) : décalée vers l'avant (02:30 → 03:30).

export const TIME_ZONE = 'Europe/Paris';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86400000;
const MINUTE_MS = 60000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function utcMidnight(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt;
}

/**
 * Vrai si `iso` est une date calendaire valide au format 'YYYY-MM-DD'.
 * @param {unknown} iso
 * @returns {boolean}
 */
export function isValidISO(iso) {
  if (typeof iso !== 'string') return false;
  const m = ISO_RE.exec(iso);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = utcMidnight(y, mo, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function dayNumber(iso) {
  if (!isValidISO(iso)) throw new RangeError(`Date invalide : ${String(iso)}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(utcMidnight(y, m, d).getTime() / DAY_MS);
}

function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Ajoute `n` jours calendaires (n peut être négatif).
 * @param {string} iso 'YYYY-MM-DD'
 * @param {number} n entier
 * @returns {string}
 */
export function addDays(iso, n) {
  return fromDayNumber(dayNumber(iso) + n);
}

/**
 * Nombre de jours calendaires de `a` à `b` (b − a) : diffDays('2026-10-30', '2026-11-02') = 3.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function diffDays(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/**
 * Comparaison chronologique de deux dates ISO : −1, 0 ou 1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Jour de cycle : (date − J1) en jours calendaires + 1.
 * @param {string} start date du J1 (ou du 1er jour du segment)
 * @param {string} iso
 * @returns {number}
 */
export function cycleDay(start, iso) {
  return diffDays(start, iso) + 1;
}

/**
 * Jour de la semaine : 0 = dimanche … 6 = samedi (convention JavaScript).
 * @param {string} iso
 * @returns {number}
 */
export function weekday(iso) {
  return new Date(dayNumber(iso) * DAY_MS).getUTCDay();
}

/**
 * La plus tardive de deux dates ISO.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function maxDate(a, b) {
  return a >= b ? a : b;
}

/**
 * La plus précoce de deux dates ISO.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function minDate(a, b) {
  return a <= b ? a : b;
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_FR_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Date en français pour les textes du moteur.
 * 'court' → « 4 oct. » · 'long' → « dimanche 4 octobre » (1er pour le premier du mois).
 * @param {string} iso
 * @param {'court'|'long'} [style]
 * @returns {string}
 */
export function formatDateFR(iso, style = 'court') {
  const dt = new Date(dayNumber(iso) * DAY_MS);
  const day = dt.getUTCDate();
  const month = dt.getUTCMonth();
  if (style === 'long') {
    return `${WEEKDAYS_FR[dt.getUTCDay()]} ${day === 1 ? '1er' : day} ${MONTHS_FR[month]}`;
  }
  return `${day === 1 ? '1er' : day} ${MONTHS_FR_SHORT[month]}`;
}

/**
 * Termine une phrase par un point, sans doubler celui d'une abréviation (« 4 oct. » → « 4 oct. »).
 * @param {string} s
 * @returns {string}
 */
export function endDot(s) {
  const t = String(s ?? '');
  return t.endsWith('.') ? t : `${t}.`;
}

/**
 * Liste des dates de `a` à `b` inclus (vide si b < a).
 * @param {string} a
 * @param {string} b
 * @returns {string[]}
 */
export function range(a, b) {
  const start = dayNumber(a), end = dayNumber(b);
  const out = [];
  for (let n = start; n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/**
 * 'HH:MM' → minutes depuis minuit (0..1439) ; null si invalide.
 * @param {unknown} time
 * @returns {number|null}
 */
export function parseTime(time) {
  if (typeof time !== 'string') return null;
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

let parisFormatter = null;
let intlUnavailable = false;

function lastSundayUTC(year, monthIndex) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  return Date.UTC(year, monthIndex, last.getUTCDate() - last.getUTCDay());
}

/**
 * Décalage de Europe/Paris selon la règle européenne (depuis 1996) :
 * heure d'été du dernier dimanche de mars 01:00 UTC au dernier dimanche d'octobre 01:00 UTC.
 * @param {number} utcMs
 * @returns {number} minutes (60 ou 120)
 */
export function euRuleOffset(utcMs) {
  const year = new Date(utcMs).getUTCFullYear();
  const start = lastSundayUTC(year, 2) + 60 * MINUTE_MS;
  const end = lastSundayUTC(year, 9) + 60 * MINUTE_MS;
  return utcMs >= start && utcMs < end ? 120 : 60;
}

/**
 * Décalage UTC (en minutes) en vigueur à Europe/Paris à l'instant `utcMs`.
 * @param {number} utcMs
 * @returns {number}
 */
export function parisOffset(utcMs) {
  if (!intlUnavailable) {
    try {
      parisFormatter ??= new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
      });
      const p = {};
      for (const { type, value } of parisFormatter.formatToParts(new Date(utcMs))) p[type] = value;
      const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
      return Math.round((local - Math.floor(utcMs / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
    } catch {
      intlUnavailable = true;
    }
  }
  return euRuleOffset(utcMs);
}

/**
 * Date + heure civiles de Europe/Paris → minutes absolues depuis l'époque Unix (UTC).
 * @param {string} iso
 * @param {string} time 'HH:MM'
 * @returns {number}
 */
export function toEpochMinutes(iso, time) {
  const t = parseTime(time);
  if (t === null) throw new RangeError(`Heure invalide : ${String(time)}`);
  const local = dayNumber(iso) * 1440 + t;
  const before = parisOffset((local - 1440) * MINUTE_MS);
  const after = parisOffset((local + 1440) * MINUTE_MS);
  const valid = [local - before, local - after].filter((u, k) => parisOffset(u * MINUTE_MS) === (k === 0 ? before : after));
  return valid.length ? Math.min(...valid) : local - before;
}

/**
 * Minutes absolues → date et heure civiles de Europe/Paris.
 * @param {number} minutes
 * @returns {{ date: string, time: string }}
 */
export function fromEpochMinutes(minutes) {
  const local = minutes + parisOffset(minutes * MINUTE_MS);
  const day = Math.floor(local / 1440);
  const rest = local - day * 1440;
  return { date: fromDayNumber(day), time: `${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}` };
}

/**
 * Durée réelle en minutes entre deux dates + heures civiles (Europe/Paris), B − A.
 * Tient compte du changement d'heure : du 2026-10-24 22:00 au 2026-10-25 22:00 il y a 1500 minutes.
 * @param {string} isoA
 * @param {string} timeA 'HH:MM'
 * @param {string} isoB
 * @param {string} timeB 'HH:MM'
 * @returns {number}
 */
export function minutesBetween(isoA, timeA, isoB, timeB) {
  return toEpochMinutes(isoB, timeB) - toEpochMinutes(isoA, timeA);
}

/**
 * Date et heure locales de l'appareil, pour construire `now` côté UI (le moteur ne lit jamais l'horloge).
 * @param {Date} [date]
 * @returns {{ today: string, time: string }}
 */
export function todayParts(date = new Date()) {
  return {
    today: `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}
