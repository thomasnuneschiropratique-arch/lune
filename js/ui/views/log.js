// Vue « Noter » : saisie rapide (le matin) et complète d'un jour.
// Route 'noter' { date } — défaut aujourd'hui, jamais dans le futur.
// L'état du formulaire est local ; rien n'est enregistré avant « Enregistrer ».

import {
  h, icon, fmtDate, fmtTemp, fmtTempShort, plural, statusBadge, addDays, diffDays, todayParts, moonSvg,
  BLEEDING_LEVELS, MUCUS_SENSATIONS, MUCUS_ASPECTS, TEMP_DISTURBANCES, TEMP_ROUTES,
  CERVIX_OPENING, CERVIX_FIRMNESS, CERVIX_POSITION, LH_RESULTS, PREGNANCY_TEST_RESULTS,
  SEX_OPTIONS, EMERGENCY_CONTRACEPTIONS, CYCLE_EVENTS, SYMPTOMS, MOODS,
} from '../dom.js'
import { parseTemp, normalizeDay } from '../../store.js'
import { sexNeedsProtection } from '../../engine/index.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const PERIOD_BLEEDING = new Set(['leger', 'moyen', 'abondant'])
const RISKY_SEX = new Set(['non_protege', 'incident'])
const TEMP_MIN = 3400
const TEMP_MAX = 4200
const TEMP_USUAL_LOW = 3550 // hors 35,50–37,80 : confirmation demandée (spec §2.2.1)
const TEMP_USUAL_HIGH = 3780
const TIME_TOLERANCE_MIN = 90 // 1 h 30 autour de l'heure habituelle (spec §2.2.1)
const TIME_HISTORY = 10
const POST_REMOVAL_WINDOW_DAYS = 14
const INTERMEDIATE_BLEEDING_DAYS = 10 // saignement < 10 j après la FHM (spec §2.1)
const PREGNANCY_TEST_DELAY_DAYS = 21
const NOTES_MAX = 2000

/** Signification des codes de glaire Sensiplan (spec §2.3.1). */
const MUCUS_CODES = {
  0: { code: 't', meaning: 'Sécheresse, pas de glaire.' },
  1: { code: '∅', meaning: 'Rien senti, rien vu.' },
  2: { code: 'f', meaning: 'Humidité sans glaire visible, déjà un signe de fertilité.' },
  3: { code: 'S', meaning: 'Glaire épaisse ou crémeuse, signe de fertilité.' },
  4: { code: 'S+', meaning: 'Glaire de meilleure qualité, fertilité maximale.' },
}

/** Libellés courts des saignements pour le contrôle segmenté. */
const BLEEDING_SHORT = {
  spotting: 'Spotting',
  leger: 'Léger',
  moyen: 'Moyen',
  abondant: 'Abondant',
  post_retrait: 'Après le retrait',
}

const EC_LABELS = { ulipristal: 'Ulipristal 30 mg (ellaOne)' }

// ---------------------------------------------------------------------------
// Fonctions pures (testables sous Node)

/**
 * Aperçu du code de glaire du jour, calculé comme le moteur (spec §2.3.1) :
 * q = max des champs renseignés ; « rien vu » seul (sans sensation) = observation incomplète.
 * @param {string|null} sensation id de MUCUS_SENSATIONS
 * @param {string|null} aspect id de MUCUS_ASPECTS
 * @param {boolean} [doubtful] observation douteuse → non prise en compte
 * @returns {{ state: 'vide'|'incomplet'|'douteux'|'ok', q: number|null, code: string|null, meaning: string }}
 */
export function mucusPreview(sensation, aspect, doubtful = false) {
  const s = MUCUS_SENSATIONS.find((o) => o.id === sensation)
  const a = MUCUS_ASPECTS.find((o) => o.id === aspect)
  if (!s && !a) return { state: 'vide', q: null, code: null, meaning: 'Pas encore d\'observation.' }
  const values = [s?.value, a?.value].filter((v) => typeof v === 'number')
  if (!values.length) {
    return { state: 'incomplet', q: null, code: null, meaning: 'Observation incomplète : note aussi la sensation.' }
  }
  const q = Math.max(...values)
  if (doubtful) {
    return { state: 'douteux', q: null, code: MUCUS_CODES[q].code, meaning: 'Observation douteuse : elle ne sera pas prise en compte (jour considéré comme non observé).' }
  }
  return { state: 'ok', q, code: MUCUS_CODES[q].code, meaning: MUCUS_CODES[q].meaning }
}

/**
 * Message d'erreur pour une saisie de température, ou null si elle est valide.
 * @param {string} str saisie brute (« 36,45 », « 36.5 »)
 * @returns {string|null}
 */
export function tempInputError(str) {
  const s = String(str ?? '').trim()
  if (!s) return null
  if (parseTemp(s) !== null) return null
  if (/^\d{2}[.,]\d{3,}$/.test(s)) return '2 décimales au maximum (par exemple 36,47).'
  const m = /^(\d{2})[.,](\d{1,2})$/.exec(s)
  if (m) return 'Valeur hors plage : elle doit être comprise entre 34,00 et 42,00 °C.'
  return 'Format attendu : deux chiffres, une virgule, puis une ou deux décimales (par exemple 36,45).'
}

/** 'HH:MM' → minutes depuis minuit (null si invalide). */
function toMinutes(time) {
  if (typeof time !== 'string' || !TIME_RE.test(time)) return null
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function fromMinutes(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Médiane d'une liste d'heures 'HH:MM' (les valeurs invalides sont ignorées).
 * @param {string[]} times
 * @returns {string|null} 'HH:MM', ou null si la liste est vide
 */
export function medianTime(times) {
  const mins = times.map(toMinutes).filter((m) => m !== null).sort((a, b) => a - b)
  if (!mins.length) return null
  const mid = Math.floor(mins.length / 2)
  return fromMinutes(mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2)
}

/**
 * Écart en minutes entre deux heures, en passant éventuellement par minuit.
 * @param {string} a 'HH:MM'
 * @param {string} b 'HH:MM'
 * @returns {number|null}
 */
export function timeGapMinutes(a, b) {
  const x = toMinutes(a)
  const y = toMinutes(b)
  if (x === null || y === null) return null
  const d = Math.abs(x - y)
  return Math.min(d, 1440 - d)
}

/**
 * Nouvelle sélection de puces après un clic : les options connues suivent l'ordre de la liste,
 * les valeurs inconnues de la liste (conservées par le store) sont gardées à la fin.
 * @param {Array<{id: string}>} options
 * @param {string[]} current valeurs actuelles
 * @param {string} toggled id cliqué
 * @returns {string[]}
 */
export function toggleChip(options, current, toggled) {
  const cur = new Set(current)
  if (cur.has(toggled)) cur.delete(toggled)
  else cur.add(toggled)
  const known = options.filter((o) => cur.has(o.id)).map((o) => o.id)
  const unknown = current.filter((id) => cur.has(id) && !options.some((o) => o.id === id))
  return [...known, ...unknown]
}

/**
 * J1 déjà notés le lendemain ou le surlendemain de `date` (même période de règles, une pause
 * d'un jour au plus, spec §2.1) : un seul 1er jour doit être gardé par période.
 * @param {object} days AppData.days
 * @param {string} date
 * @returns {string[]} dates ISO
 */
export function nearbyLaterJ1(days, date) {
  return [1, 2]
    .map((n) => addDays(date, n))
    .filter((iso) => iso && days?.[iso]?.cycleStart === true && PERIOD_BLEEDING.has(days[iso].bleeding))
}

// ---------------------------------------------------------------------------
// Célébration après un enregistrement (décor seulement : ne touche jamais à la sauvegarde)

/** Durée de l'éclat d'étoiles, en ms (l'animation CSS dure 600 ms au plus). */
const CELEBRATE_MS = 700
/** Positions des étoiles autour du bouton (% de la boîte du bouton) et délais d'apparition. */
const BURST = [
  [-4, 18, 0], [6, -34, 40], [30, -46, 90], [58, -40, 20], [84, -30, 70],
  [104, 8, 30], [96, 116, 80], [70, 136, 10], [40, 140, 60], [8, 120, 100],
]
/**
 * Enregistrement réussi en attente de célébration : actions.saveDay() reconstruit la vue
 * (main.js), c'est donc la NOUVELLE vue qui joue l'animation sur son bouton.
 * @type {{ date: string, at: number } | null}
 */
let pendingCelebration = null

function prefersReducedMotion(doc) {
  try {
    return !!doc?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

/**
 * Coche qui « pop » et éclat d'étoiles dorées autour du bouton Enregistrer (600 ms).
 * Purement décoratif (aria-hidden) ; rien sous prefers-reduced-motion ; jamais d'exception.
 * @param {HTMLElement} btn
 */
function celebrate(btn) {
  try {
    if (!btn || btn.isConnected !== true) return
    const doc = btn.ownerDocument
    if (prefersReducedMotion(doc)) return
    const wrap = btn.parentNode
    const burst = h('span', { class: 'log-burst', ariaHidden: 'true' },
      BURST.map(([x, y, delay], i) => h('span', {
        class: ['log-burst__star', i % 3 === 0 && 'log-burst__star--big'],
        style: { left: `${x}%`, top: `${y}%`, '--delay': `${delay}ms` },
      }, icon('star', { size: 14 }))))
    wrap.append(burst)
    btn.classList.add('is-celebrating')
    doc.defaultView.setTimeout(() => {
      burst.remove()
      btn.classList.remove('is-celebrating')
    }, CELEBRATE_MS)
  } catch { /* décor seulement */ }
}

// ---------------------------------------------------------------------------
// Petits composants (créent du DOM : à appeler uniquement depuis render)

function alertBox(tone, iconName, title, ...body) {
  return h('div', { class: ['alert', `alert--${tone}`] },
    icon(iconName, { size: 20 }),
    h('div', { class: 'stack stack--sm' },
      title ? h('p', { class: 'alert__title' }, title) : null,
      ...body))
}

/** Ajoute des enfants à `el` en ignorant les valeurs vides (append(null) insérerait « null »). */
function fill(el, ...children) {
  el.append(...children.flat().filter(Boolean))
}

/** Ouvre la section qui contient `el`, puis l'amène à l'écran et lui donne le focus. */
function reveal(el) {
  if (!el) return
  const details = el.closest('details')
  if (details) details.open = true
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* ancien navigateur */ }
  el.focus({ preventScroll: true })
}

// ---------------------------------------------------------------------------
// Vue

/**
 * Affiche la vue « Noter ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 */
export function render(root, ctx) {
  const { data, analysis, actions, ui } = ctx
  const today = ctx.now.today
  const asked = ctx.route?.params?.date
  const date = typeof asked === 'string' && ISO_RE.test(asked) && diffDays(asked, today) !== null && asked <= today
    ? asked
    : today
  const isToday = date === today

  const days = data?.days || {}
  const dayKeys = Object.keys(days).sort()
  const saved = days[date] || null
  const entry = saved || {}
  const profile = data?.profile || {}
  const settings = data?.settings || {}
  const status = analysis?.days?.[date] || null
  const cycles = Array.isArray(analysis?.cycles) ? analysis.cycles : []

  // ---- Contexte du cycle (moteur si disponible, sinon repli sur les données brutes)

  const findCycle = (iso) => cycles.find((c) => c && c.start <= iso && (!c.end || iso <= c.end)) || null
  const cycle = findCycle(date)
  // Cycle « en cours » avant ce jour : sert à juger un saignement qui pourrait ouvrir un nouveau cycle.
  const prevCycle = findCycle(addDays(date, -1)) || cycle

  function cycleBounds() {
    if (cycle) return { start: cycle.start, end: cycle.end || today }
    let start = dayKeys[0] && dayKeys[0] < date ? dayKeys[0] : date
    for (const k of dayKeys) if (k <= date && days[k].cycleStart) start = k
    let end = today
    for (const k of dayKeys) {
      if (k > date && days[k].cycleStart) { end = addDays(k, -1); break }
    }
    return { start, end }
  }
  const bounds = cycleBounds()
  const removal = ISO_RE.test(profile.iudRemovalDate || '') ? profile.iudRemovalDate : null

  const isCycle0Context = (() => {
    if (prevCycle) return prevCycle.isCycle0 === true
    // Sans analyse : cycle 0 tant qu'aucun J1 n'a été confirmé depuis le retrait (y compris avant le retrait).
    if (!removal) return false
    return !dayKeys.some((k) => k >= removal && k < date && days[k].cycleStart)
  })()
  const isCycle0 = cycle?.isCycle0 === true || (status?.overlays || []).includes('cycle0') || (!cycle && isCycle0Context)

  const ecInPrevCycle = (() => {
    const from = prevCycle?.flags?.emergencyContraception
    if (from) return from <= date
    if (prevCycle) return false
    return dayKeys.some((k) => k >= bounds.start && k < date && days[k].emergencyContraception)
  })()

  const daysSinceFhm = (() => {
    const fhm = prevCycle?.temp?.fhm
    if (!fhm) return null
    const d = diffDays(fhm, date)
    return d !== null && d >= 0 ? d : null
  })()

  const prevWasPeriod = [1, 2].some((n) => PERIOD_BLEEDING.has(days[addDays(date, -n)]?.bleeding))
  const inPostRemovalWindow = removal !== null && date >= removal && diffDays(removal, date) <= POST_REMOVAL_WINDOW_DAYS

  const lastTempBefore = (() => {
    for (let i = dayKeys.length - 1; i >= 0; i--) {
      const k = dayKeys[i]
      if (k < date && Number.isInteger(days[k].temp)) return { iso: k, temp: days[k].temp }
    }
    return null
  })()

  const usualTime = (() => {
    const times = dayKeys
      .filter((k) => k < date && Number.isInteger(days[k].temp) && days[k].tempTime)
      .slice(-TIME_HISTORY)
      .map((k) => days[k].tempTime)
    return times.length >= 3 ? medianTime(times) : null
  })()

  const otherRoutesInCycle = new Set(dayKeys
    .filter((k) => k !== date && k >= bounds.start && k <= bounds.end && Number.isInteger(days[k].temp) && days[k].tempRoute)
    .map((k) => days[k].tempRoute))

  // ---- État local du formulaire

  const form = {
    bleeding: entry.bleeding || null,
    // true / false = réponse donnée ; null = question encore à poser.
    cycleStartAnswer: entry.cycleStart === true ? true : (saved && PERIOD_BLEEDING.has(entry.bleeding) ? false : null),
    tempStr: Number.isInteger(entry.temp) ? fmtTempShort(entry.temp) : '',
    tempConfirmed: Number.isInteger(entry.temp) ? entry.temp : null, // valeur inhabituelle confirmée
    tempTime: entry.tempTime || (isToday ? ctx.now.time : ''),
    tempRoute: entry.tempRoute || profile.tempRoute || TEMP_ROUTES[0].id,
    thermometerChanged: entry.thermometerChanged === true,
    tempDisturbances: [...(entry.tempDisturbances || [])],
    tempDisturbanceNote: entry.tempDisturbanceNote || '',
    tempExcluded: entry.tempExcluded === true,
    mucusSensation: entry.mucusSensation || null,
    mucusAspect: entry.mucusAspect || null,
    mucusDoubtful: entry.mucusDoubtful === true,
    cervixOpening: entry.cervixOpening || null,
    cervixFirmness: entry.cervixFirmness || null,
    cervixPosition: entry.cervixPosition || null,
    lh: entry.lh || null,
    pregnancyTest: entry.pregnancyTest || null,
    sex: entry.sex || null,
    sexTime: entry.sexTime || '',
    emergencyContraception: entry.emergencyContraception || null,
    emergencyContraceptionTime: entry.emergencyContraceptionTime || '',
    cycleUnevaluable: entry.cycleUnevaluable === true,
    events: [...(entry.events || [])],
    pain: Number.isInteger(entry.pain) ? entry.pain : null,
    symptoms: [...(entry.symptoms || [])],
    moods: [...(entry.moods || [])],
    notes: entry.notes || '',
  }
  let tempTouched = false
  let disturbanceNoteTouched = false
  // Note de perturbation déjà enregistrée sans « Autre » (import, ancienne version) : gardée
  // tant que le champ n'est pas modifié.
  const keepOrphanNote = !!entry.tempDisturbanceNote && !(entry.tempDisturbances || []).includes('autre')

  const isPeriod = () => PERIOD_BLEEDING.has(form.bleeding)
  const parsedTemp = () => (form.tempStr.trim() ? parseTemp(form.tempStr) : null)
  const tempUnusual = (c) => c !== null && (c < TEMP_USUAL_LOW || c > TEMP_USUAL_HIGH)
  const j1QuestionVisible = () => isPeriod() && !prevWasPeriod && form.cycleStartAnswer === null
  const isRiskySex = () => RISKY_SEX.has(form.sex)

  function buildEntry() {
    const temp = parsedTemp()
    const hasDisturbance = form.tempDisturbances.length > 0
    return {
      ...entry,
      bleeding: form.bleeding || undefined,
      cycleStart: isPeriod() && form.cycleStartAnswer === true ? true : undefined,
      temp: temp ?? undefined,
      tempTime: temp !== null && form.tempTime ? form.tempTime : undefined,
      tempRoute: temp !== null ? form.tempRoute : undefined,
      thermometerChanged: temp !== null && form.thermometerChanged ? true : undefined,
      tempDisturbances: form.tempDisturbances,
      tempDisturbanceNote: form.tempDisturbances.includes('autre') || (keepOrphanNote && !disturbanceNoteTouched)
        ? form.tempDisturbanceNote
        : undefined,
      tempExcluded: hasDisturbance && form.tempExcluded ? true : undefined,
      mucusSensation: form.mucusSensation || undefined,
      mucusAspect: form.mucusAspect || undefined,
      mucusDoubtful: form.mucusDoubtful || undefined,
      cervixOpening: form.cervixOpening || undefined,
      cervixFirmness: form.cervixFirmness || undefined,
      cervixPosition: form.cervixPosition || undefined,
      lh: form.lh || undefined,
      pregnancyTest: form.pregnancyTest || undefined,
      sex: form.sex || undefined,
      sexTime: form.sex && form.sexTime ? form.sexTime : undefined,
      emergencyContraception: form.emergencyContraception || undefined,
      emergencyContraceptionTime: form.emergencyContraception && form.emergencyContraceptionTime ? form.emergencyContraceptionTime : undefined,
      cycleUnevaluable: form.cycleUnevaluable || undefined,
      events: form.events,
      pain: form.pain ?? undefined,
      symptoms: form.symptoms,
      moods: form.moods,
      notes: form.notes,
    }
  }

  const snapshot = () => JSON.stringify(normalizeDay(buildEntry()))
  const baseline = snapshot()
  const isDirty = () => snapshot() !== baseline || (form.tempStr.trim() !== '' && parsedTemp() === null)

  // ---- Rafraîchissement : chaque partie dynamique s'enregistre ici

  const refreshers = []
  function refresh() {
    for (const fn of refreshers) fn()
  }

  /**
   * Zone reconstruite quand sa clé change (préserve le focus ailleurs).
   * @param {() => string} key
   * @param {() => (Node|null|Array)} build
   */
  function slot(key, build) {
    const el = h('div', { class: 'log-slot' })
    let last = null
    refreshers.push(() => {
      const k = key()
      if (k === last) return
      last = k
      el.replaceChildren(...[].concat(build() || []).flat().filter(Boolean))
    })
    return el
  }

  function showWhen(el, test) {
    refreshers.push(() => { el.hidden = !test() })
    return el
  }

  function section({ key, title, iconName, open, summary }) {
    const sumEl = h('span', { class: 'log-sec__summary' })
    const body = h('div', { class: 'log-sec__body stack' })
    const el = h('details', { class: ['card', 'log-sec', `log-sec--${key}`], id: `log-sec-${key}`, open: !!open },
      h('summary', { class: 'log-sec__head' },
        h('span', { class: 'log-sec__icon' }, icon(iconName, { size: 20 })),
        h('span', { class: 'log-sec__titles' },
          h('h2', { class: 'log-sec__title' }, title),
          sumEl),
        h('span', { class: 'log-sec__chev' }, icon('chevron-down', { size: 20 }))),
      body)
    refreshers.push(() => { sumEl.textContent = summary() })
    return { el, body }
  }

  function labelled(id, text, control, hint) {
    return h('div', { class: 'field' },
      h('span', { class: 'label', id: `${id}-label` }, text),
      control(`${id}-label`),
      hint ? h('p', { class: 'hint' }, hint) : null)
  }

  /** Contrôle segmenté (un seul choix). Recliquer l'option active la désélectionne, sauf option null. */
  function seg({ labelledBy, options, get, set, layout = 'row' }) {
    const el = h('div', { class: ['seg', 'log-seg', `log-seg--${layout}`], role: 'group', ariaLabelledby: labelledBy })
    const buttons = options.map((opt) => {
      const id = opt.id ?? null
      const b = h('button', {
        type: 'button',
        class: 'seg__opt',
        ariaPressed: 'false',
        on: {
          click: () => {
            set(id !== null && get() === id ? null : id)
            refresh()
          },
        },
      },
      h('span', { class: 'log-seg__text' },
        h('span', { class: 'log-seg__label' }, opt.label),
        layout === 'list' && opt.hint ? h('span', { class: 'log-seg__hint' }, opt.hint) : null),
      opt.code ? h('span', { class: 'log-seg__code mono', ariaHidden: 'true', dataset: { q: opt.value } }, opt.code) : null)
      el.append(b)
      return [id, b]
    })
    refreshers.push(() => {
      const cur = get() ?? null
      for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === cur))
    })
    return el
  }

  /** Puces à choix multiple ; l'ordre stocké suit celui des options. */
  function chips({ labelledBy, options, get, set }) {
    const el = h('div', { class: 'log-chips', role: 'group', ariaLabelledby: labelledBy })
    const buttons = options.map((opt) => {
      const b = h('button', {
        type: 'button',
        class: 'chip',
        ariaPressed: 'false',
        dataset: { id: opt.id },
        on: {
          click: () => {
            set(toggleChip(options, get(), opt.id))
            refresh()
          },
        },
      }, opt.label)
      el.append(b)
      return [opt.id, b]
    })
    refreshers.push(() => {
      const cur = get()
      for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(cur.includes(id)))
    })
    return el
  }

  /** Interrupteur (case à cocher role="switch") avec libellé lié. */
  function toggle({ id, label, hint, get, set }) {
    const input = h('input', {
      type: 'checkbox',
      id,
      role: 'switch',
      class: 'log-switch__input',
      ariaDescribedby: hint ? `${id}-hint` : null,
      on: { change: (e) => { set(e.target.checked); refresh() } },
    })
    refreshers.push(() => { input.checked = !!get() })
    return h('div', { class: 'log-switch' },
      h('label', { class: 'log-switch__row', htmlFor: id },
        input,
        h('span', { class: 'log-switch__label' }, label)),
      hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null)
  }

  function timeField(id, label, get, set) {
    const input = h('input', {
      type: 'time',
      id,
      class: 'input log-time',
      value: get(),
      on: { input: (e) => { set(e.target.value); refresh() } },
    })
    return h('div', { class: 'field log-time-field' }, h('label', { class: 'label', htmlFor: id }, label), input)
  }

  // Garde de sortie de la coque (K7) : onglets, en-tête, bouton Retour, liens internes.
  const shellGuard = typeof ctx.setLeaveGuard === 'function'
  if (shellGuard) ctx.setLeaveGuard(() => isDirty())

  /** Quitte la vue en prévenant si des modifications ne sont pas enregistrées. */
  async function leave(name, params) {
    // Avec la garde K7, c'est la coque qui demande confirmation (une seule fois).
    if (!shellGuard && isDirty()) {
      const ok = await ui.confirm({
        title: 'Modifications non enregistrées',
        text: 'Si tu quittes ce jour maintenant, ce que tu viens de saisir sera perdu.',
        confirmLabel: 'Quitter sans enregistrer',
        cancelLabel: 'Rester',
        danger: true,
      })
      if (!ok) return
    }
    ctx.navigate(name, params)
  }

  const goToDate = (iso) => {
    if (iso && iso !== date && iso <= today) leave('noter', { date: iso })
  }

  // =========================================================================
  // En-tête : navigation de date + état du jour

  const nextDisabled = date >= today
  const datePicker = h('input', {
    type: 'date',
    id: 'log-date-picker',
    class: 'input log-datepick',
    value: date,
    max: today,
    on: { change: (e) => { if (ISO_RE.test(e.target.value)) goToDate(e.target.value) } },
  })

  // Petite lune du jour (décor) : sa forme suit le jour du cycle, comme dans le ciel d'Aujourd'hui.
  const meanLength = Math.round(Number(analysis?.stats?.cycleLength?.mean)) || 28
  const moon = status?.cycleDay ? moonSvg(status.cycleDay, meanLength, { size: 46, label: null }) : null

  const head = h('header', { class: 'log-head card card--flat' },
    h('p', { class: 'eyebrow' }, isToday ? 'Noter aujourd\'hui' : 'Noter un jour passé'),
    h('div', { class: 'log-datenav' },
      h('button', {
        type: 'button',
        class: 'iconbtn',
        ariaLabel: `Jour précédent (${fmtDate(addDays(date, -1), 'long')})`,
        on: { click: () => goToDate(addDays(date, -1)) },
      }, icon('chevron-left', { size: 24 })),
      h('div', { class: 'log-date-wrap' },
        moon ? h('span', { class: 'log-moon' }, moon) : null,
        h('h1', { class: 'log-date' }, fmtDate(date, date.slice(0, 4) === today.slice(0, 4) ? 'long' : 'complet'))),
      h('button', {
        type: 'button',
        class: 'iconbtn',
        ariaLabel: nextDisabled ? 'Jour suivant (pas de saisie dans le futur)' : `Jour suivant (${fmtDate(addDays(date, 1), 'long')})`,
        disabled: nextDisabled,
        on: { click: () => goToDate(addDays(date, 1)) },
      }, icon('chevron-right', { size: 24 }))),
    h('div', { class: 'log-head__meta' },
      status ? statusBadge(status) : h('span', { class: 'badge' }, icon('help', { size: 16 }), h('span', {}, 'Pas encore de statut')),
      status?.cycleDay ? h('span', { class: 'log-head__cycleday mono' }, `J${status.cycleDay}${isCycle0 ? ' (cycle 0)' : ''}`) : null,
      saved ? null : h('span', { class: 'muted log-head__empty' }, 'Rien de noté'),
      h('span', { class: 'log-head__tools' },
        isToday ? null : h('button', { type: 'button', class: 'btn btn--sm btn--ghost', on: { click: () => goToDate(today) } }, 'Aujourd\'hui'),
        h('label', { class: 'sr-only', htmlFor: 'log-date-picker' }, 'Choisir une date'),
        datePicker)))

  // =========================================================================
  // 1. Saignements

  const bleedOptions = [{ id: null, label: 'Aucun' }]
  for (const id of ['spotting', 'leger', 'moyen', 'abondant']) bleedOptions.push({ id, label: BLEEDING_SHORT[id] })
  if (inPostRemovalWindow || entry.bleeding === 'post_retrait') bleedOptions.push({ id: 'post_retrait', label: BLEEDING_SHORT.post_retrait })

  const secBleeding = section({
    key: 'saignements',
    title: 'Saignements',
    iconName: 'drop',
    open: true,
    summary: () => {
      if (!form.bleeding) return 'Aucun'
      const label = BLEEDING_LEVELS.find((o) => o.id === form.bleeding)?.label || form.bleeding
      return isPeriod() && form.cycleStartAnswer === true ? `${label} · J1` : label
    },
  })

  function intermediateReason() {
    if (isCycle0Context && removal && date <= removal) return 'Le stérilet n\'est pas encore retiré ce jour-là : seules les premières vraies règles après le retrait démarreront le cycle 1.'
    if (isCycle0Context) return 'Tu es encore dans le cycle 0 : tes premières vraies règles après le retrait ne sont pas encore confirmées.'
    if (ecInPrevCycle) return 'Une contraception d\'urgence a été prise dans ce cycle.'
    if (daysSinceFhm !== null && daysSinceFhm < INTERMEDIATE_BLEEDING_DAYS) {
      return `La température est montée il y a seulement ${daysSinceFhm} ${plural(daysSinceFhm, 'jour')}.`
    }
    return null
  }

  const j1Yes = h('button', {
    type: 'button',
    id: 'log-j1-yes',
    class: 'btn btn--primary btn--sm',
    on: { click: () => { form.cycleStartAnswer = true; refresh(); document.getElementById('log-cycle-start')?.focus() } },
  }, 'Oui, nouveau cycle')
  const j1No = h('button', {
    type: 'button',
    class: 'btn btn--sm',
    on: { click: () => { form.cycleStartAnswer = false; refresh(); document.getElementById('log-cycle-start')?.focus() } },
  }, 'Non')

  fill(secBleeding.body,
    labelled('log-bleeding', 'Saignement du jour', (lb) => seg({
      labelledBy: lb,
      options: bleedOptions,
      layout: 'grid3',
      get: () => form.bleeding,
      set: (v) => { form.bleeding = v },
    })),
    slot(() => form.bleeding || '', () => {
      const hint = BLEEDING_LEVELS.find((o) => o.id === form.bleeding)?.hint
      const extra = form.bleeding === 'spotting' ? ' Hors des règles, il compte comme une glaire S+ (fertile).' : ''
      return hint || extra ? h('p', { class: 'hint' }, `${hint || ''}${extra}`.trim()) : null
    }),
    showWhen(h('div', { class: 'log-question', role: 'group', ariaLabelledby: 'log-j1-question' },
      h('p', { class: 'log-question__title', id: 'log-j1-question' }, 'Est-ce le 1er jour de tes règles ? (nouveau cycle)'),
      h('p', { class: 'hint' }, 'Réponds oui seulement pour de vraies règles, d\'abondance habituelle. Un spotting ne démarre jamais un cycle.'),
      h('div', { class: 'row' }, j1Yes, j1No)), j1QuestionVisible),
    showWhen(toggle({
      id: 'log-cycle-start',
      label: 'Début de cycle (J1)',
      hint: 'Ce jour est le 1er jour de vraies règles : un nouveau cycle commence.',
      get: () => form.cycleStartAnswer === true,
      set: (v) => { form.cycleStartAnswer = v },
    }), () => isPeriod() && !j1QuestionVisible() && (!prevWasPeriod || entry.cycleStart === true)),
    slot(() => String(isPeriod()), () => {
      if (!isPeriod()) return null
      const out = []
      const reason = intermediateReason()
      if (reason) {
        out.push(alertBox('attention', 'alert', 'Un saignement intermédiaire peut ressembler à des règles.',
          h('p', {}, reason),
          h('p', {}, 'Ne confirme le 1er jour que s\'il s\'agit de vraies règles, d\'abondance habituelle. Dans le doute, réponds non : tu restes considérée comme fertile.')))
      }
      if (inPostRemovalWindow) {
        out.push(h('p', { class: 'hint' }, 'Juste après le retrait, un saignement est souvent provoqué par le geste lui-même. Dans ce cas, choisis « Après le retrait » : il ne compte jamais comme 1er jour de règles.'))
      }
      return out
    }),
  )

  // =========================================================================
  // 2. Température

  const secTemp = section({
    key: 'temperature',
    title: 'Température',
    iconName: 'thermo',
    open: true,
    summary: () => {
      const c = parsedTemp()
      const parts = []
      if (c !== null) parts.push(fmtTemp(c))
      else if (form.tempStr.trim()) parts.push('Saisie à corriger')
      else parts.push('Pas de mesure')
      if (c !== null && form.tempTime) parts.push(form.tempTime)
      if (form.tempDisturbances.length) parts.push(form.tempExcluded ? 'exclue' : 'perturbée')
      return parts.join(' · ')
    },
  })

  const tempError = h('p', { class: 'log-error', id: 'log-temp-error', role: 'alert' })
  const tempInput = h('input', {
    type: 'text',
    id: 'log-temp',
    class: 'input log-temp__input',
    value: form.tempStr,
    placeholder: '36,45',
    attrs: { inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', spellcheck: 'false' },
    ariaDescribedby: 'log-temp-error log-temp-hint',
    on: {
      input: (e) => { form.tempStr = e.target.value; refresh() },
      blur: () => { tempTouched = true; refresh() },
    },
  })
  refreshers.push(() => {
    const msg = tempTouched ? tempInputError(form.tempStr) : null
    // Erreur effacée dès que la saisie redevient valide.
    tempError.textContent = msg || ''
    tempError.hidden = !msg
    if (msg) tempInput.setAttribute('aria-invalid', 'true')
    else tempInput.removeAttribute('aria-invalid')
  })

  function stepTemp(delta) {
    const base = parsedTemp() ?? lastTempBefore?.temp ?? 3650
    const next = Math.min(TEMP_MAX, Math.max(TEMP_MIN, base + delta))
    form.tempStr = fmtTempShort(next)
    tempInput.value = form.tempStr
    tempTouched = true
    refresh()
  }

  const tempHint = h('p', { class: 'hint', id: 'log-temp-hint' },
    lastTempBefore
      ? `Dernière mesure : ${fmtTemp(lastTempBefore.temp)} (${fmtDate(lastTempBefore.iso, 'jour')}). Virgule ou point, 2 décimales au maximum.`
      : 'Virgule ou point, 2 décimales au maximum.')

  fill(secTemp.body,
    h('div', { class: 'field' },
      h('label', { class: 'label', htmlFor: 'log-temp' }, 'Température au réveil (°C)'),
      h('div', { class: 'log-temp' },
        h('button', { type: 'button', class: 'btn log-temp__step', ariaLabel: 'Baisser de 0,05 °C', on: { click: () => stepTemp(-5) } }, '−0,05'),
        tempInput,
        h('button', { type: 'button', class: 'btn log-temp__step', ariaLabel: 'Monter de 0,05 °C', on: { click: () => stepTemp(5) } }, '+0,05')),
      tempError,
      tempHint),
    slot(() => {
      const c = parsedTemp()
      return tempUnusual(c) ? `${c}|${form.tempConfirmed === c}` : ''
    }, () => {
      const c = parsedTemp()
      if (!tempUnusual(c)) return null
      if (form.tempConfirmed === c) {
        return h('p', { class: 'hint log-confirmed', id: 'log-temp-confirmed', tabIndex: -1 },
          icon('check', { size: 16 }), ` Valeur inhabituelle confirmée : ${fmtTemp(c)}.`)
      }
      return alertBox('attention', 'alert', `Valeur inhabituelle : ${fmtTemp(c)}`,
        h('p', {}, 'Elle sort de la plage habituelle (35,50 à 37,80 °C). Vérifie ta saisie et ton thermomètre.'),
        c > TEMP_USUAL_HIGH ? h('p', {}, 'Fièvre ? Coche « Fièvre ou maladie » dans les perturbations ci-dessous.') : null,
        h('div', { class: 'row' },
          h('button', {
            type: 'button',
            id: 'log-temp-confirm',
            class: 'btn btn--sm',
            on: { click: () => { form.tempConfirmed = c; refresh(); document.getElementById('log-temp-confirmed')?.focus() } },
          }, 'Oui, la valeur est juste')))
    }),
    h('div', { class: 'log-temp-meta' },
      timeField('log-temp-time', 'Heure de mesure', () => form.tempTime, (v) => { form.tempTime = v }),
      labelled('log-temp-route', 'Voie', (lb) => seg({
        labelledBy: lb,
        options: TEMP_ROUTES,
        get: () => form.tempRoute,
        set: (v) => { if (v) form.tempRoute = v },
      }))),
    slot(() => form.tempRoute, () => {
      const hint = TEMP_ROUTES.find((o) => o.id === form.tempRoute)?.hint
      return hint ? h('p', { class: 'hint' }, hint) : null
    }),
    slot(() => String([...otherRoutesInCycle].some((r) => r !== form.tempRoute)), () => {
      if (![...otherRoutesInCycle].some((r) => r !== form.tempRoute)) return null
      return alertBox('attention', 'alert', 'Changer de voie rend le cycle non évaluable',
        h('p', {}, 'Une autre voie de mesure est déjà notée dans ce cycle. Garde la même voie et le même thermomètre jusqu\'aux prochaines règles, sauf s\'il s\'agit d\'une erreur de saisie.'))
    }),
    h('label', { class: 'log-check', htmlFor: 'log-thermo-changed' },
      h('input', {
        type: 'checkbox',
        id: 'log-thermo-changed',
        checked: form.thermometerChanged,
        on: { change: (e) => { form.thermometerChanged = e.target.checked; refresh() } },
      }),
      h('span', {}, 'Nouveau thermomètre depuis la dernière mesure')),
    slot(() => String(form.thermometerChanged), () => {
      if (!form.thermometerChanged) return null
      return alertBox('attention', 'alert', 'Changer de thermomètre rend le cycle non évaluable',
        h('p', {}, 'Si une mesure a déjà été prise avec l\'ancien thermomètre dans ce cycle, le cycle devient non évaluable à partir de ce jour : il reste entièrement fertile jusqu\'aux prochaines règles. Garde ensuite ce nouveau thermomètre.'))
    }),
    slot(() => {
      const gap = usualTime && parsedTemp() !== null ? timeGapMinutes(form.tempTime, usualTime) : null
      return gap !== null && gap > TIME_TOLERANCE_MIN ? `${usualTime}|${form.tempDisturbances.includes('heure_inhabituelle')}` : ''
    }, () => {
      const gap = usualTime && parsedTemp() !== null ? timeGapMinutes(form.tempTime, usualTime) : null
      if (gap === null || gap <= TIME_TOLERANCE_MIN) return null
      const flagged = form.tempDisturbances.includes('heure_inhabituelle')
      return alertBox('info', 'clock', 'Mesure perturbée ?',
        h('p', {}, `Tu mesures d'habitude vers ${usualTime}. Une heure très différente peut fausser la valeur.`),
        flagged ? null : h('div', { class: 'row' },
          h('button', {
            type: 'button',
            class: 'btn btn--sm',
            on: {
              click: () => {
                if (!form.tempDisturbances.includes('heure_inhabituelle')) {
                  form.tempDisturbances = toggleChip(TEMP_DISTURBANCES, form.tempDisturbances, 'heure_inhabituelle')
                }
                if (form.tempDisturbances.length === 1) form.tempExcluded = true
                refresh()
                root.querySelector('[data-id="heure_inhabituelle"]')?.focus()
              },
            },
          }, 'Oui, noter « Heure inhabituelle »')))
    }),
  )

  const disturbanceNote = h('input', {
    type: 'text',
    id: 'log-temp-note',
    class: 'input',
    value: form.tempDisturbanceNote,
    maxLength: 200,
    placeholder: 'Ce qui a pu perturber la mesure',
    on: { input: (e) => { form.tempDisturbanceNote = e.target.value; disturbanceNoteTouched = true; refresh() } },
  })

  fill(secTemp.body,
    labelled('log-temp-dist', 'Perturbations', (lb) => chips({
      labelledBy: lb,
      options: TEMP_DISTURBANCES,
      get: () => form.tempDisturbances,
      set: (v) => {
        if (!form.tempDisturbances.length && v.length) form.tempExcluded = true // exclusion activée par défaut
        if (!v.length) form.tempExcluded = false
        form.tempDisturbances = v
      },
    })),
    slot(() => form.tempDisturbances.join(','), () => {
      const hints = TEMP_DISTURBANCES.filter((o) => o.hint && o.id !== 'autre' && form.tempDisturbances.includes(o.id))
      return hints.map((o) => h('p', { class: 'hint' }, `${o.label} : ${o.hint}`))
    }),
    showWhen(h('div', { class: 'field' },
      h('label', { class: 'label', htmlFor: 'log-temp-note' }, 'Précise la perturbation'),
      disturbanceNote), () => form.tempDisturbances.includes('autre')),
    showWhen(h('div', { class: 'stack stack--sm' },
      toggle({
        id: 'log-temp-excluded',
        label: 'Exclure cette valeur de l\'évaluation',
        hint: 'Exclus seulement une valeur perturbée vers le HAUT, en phase basse. Une valeur trop basse ne peut pas simuler une montée : garde-la.',
        get: () => form.tempExcluded,
        set: (v) => { form.tempExcluded = v },
      }),
      cycle?.temp?.refusedExclusions?.includes(date)
        ? alertBox('info', 'info', 'Exclusion refusée par le calcul',
          h('p', {}, 'Exclure cette valeur reviendrait à contourner la règle de la valeur retombée (exception 2). Elle reste prise en compte.'))
        : null), () => form.tempDisturbances.length > 0),
    h('p', { class: 'hint log-conditions' },
      icon('info', { size: 16 }),
      h('span', {}, 'Au réveil, avant de te lever, après au moins 1 h de repos. Même voie et même thermomètre tout le cycle. Au moins 3 min (5 min en bouche), pas seulement jusqu\'au bip.')),
  )

  // =========================================================================
  // 3. Glaire

  const mucusMain = profile.secondarySign !== 'col'
  const mucusCodeEl = h('span', { class: 'log-code__value', ariaHidden: 'true' })
  const mucusMeaningEl = h('span', { class: 'log-code__meaning' })
  const mucusCodeBox = h('div', { class: 'log-code', role: 'status', ariaLive: 'polite' },
    h('span', { class: 'log-code__label eyebrow' }, 'Code du jour'),
    mucusCodeEl,
    mucusMeaningEl)
  refreshers.push(() => {
    const p = mucusPreview(form.mucusSensation, form.mucusAspect, form.mucusDoubtful)
    mucusCodeEl.textContent = p.code || '—'
    mucusCodeBox.dataset.state = p.state
    mucusCodeBox.dataset.q = p.q === null ? '' : String(p.q) // teinte de la pastille (décor)
    mucusMeaningEl.textContent = p.code && p.state === 'ok' ? `${p.code} : ${p.meaning}` : p.meaning
  })

  const secMucus = section({
    key: 'glaire',
    title: mucusMain ? 'Glaire' : 'Glaire (optionnel)',
    iconName: 'sparkle',
    open: mucusMain,
    summary: () => {
      const p = mucusPreview(form.mucusSensation, form.mucusAspect, form.mucusDoubtful)
      if (p.state === 'vide') return 'Non observée'
      if (p.state === 'incomplet') return 'Incomplète'
      if (p.state === 'douteux') return `${p.code} (douteuse)`
      return p.code
    },
  })
  fill(secMucus.body,
    h('p', { class: 'hint log-reminder' }, icon('info', { size: 16 }), h('span', {}, 'Note la meilleure qualité de la journée, observée à l\'entrée du vagin.')),
    labelled('log-mucus-sensation', 'Sensation', (lb) => seg({
      labelledBy: lb,
      options: MUCUS_SENSATIONS,
      layout: 'list',
      get: () => form.mucusSensation,
      set: (v) => { form.mucusSensation = v },
    })),
    labelled('log-mucus-aspect', 'Aspect', (lb) => seg({
      labelledBy: lb,
      options: MUCUS_ASPECTS,
      layout: 'list',
      get: () => form.mucusAspect,
      set: (v) => { form.mucusAspect = v },
    })),
    mucusCodeBox,
    slot(() => `${form.bleeding}`, () => {
      if (form.bleeding === 'spotting') return h('p', { class: 'hint' }, 'Le spotting de ce jour compte comme une glaire S+, quel que soit ce que tu notes ici.')
      if (isPeriod()) return h('p', { class: 'hint' }, 'Pendant les règles, l\'observation de la glaire n\'est pas exigée.')
      return null
    }),
    h('label', { class: 'log-check', htmlFor: 'log-mucus-doubtful' },
      h('input', {
        type: 'checkbox',
        id: 'log-mucus-doubtful',
        checked: form.mucusDoubtful,
        on: { change: (e) => { form.mucusDoubtful = e.target.checked; refresh() } },
      }),
      h('span', {}, 'Observation douteuse (rapport, infection, sperme…)')),
  )

  // =========================================================================
  // 3 bis. Col de l'utérus

  const cervixMain = profile.secondarySign === 'col'
  const secCervix = section({
    key: 'col',
    title: cervixMain ? 'Col de l\'utérus' : 'Col (optionnel)',
    iconName: 'leaf',
    open: cervixMain,
    summary: () => {
      const parts = [
        CERVIX_OPENING.find((o) => o.id === form.cervixOpening)?.label,
        CERVIX_FIRMNESS.find((o) => o.id === form.cervixFirmness)?.label,
        CERVIX_POSITION.find((o) => o.id === form.cervixPosition)?.label,
      ].filter(Boolean)
      return parts.length ? parts.join(', ') : 'Non observé'
    },
  })
  fill(secCervix.body,
    labelled('log-cervix-opening', 'Ouverture', (lb) => seg({
      labelledBy: lb, options: CERVIX_OPENING, get: () => form.cervixOpening, set: (v) => { form.cervixOpening = v },
    })),
    labelled('log-cervix-firmness', 'Fermeté', (lb) => seg({
      labelledBy: lb, options: CERVIX_FIRMNESS, get: () => form.cervixFirmness, set: (v) => { form.cervixFirmness = v },
    }), 'Dur : ferme, comme le bout du nez. Mou : souple, comme les lèvres.'),
    labelled('log-cervix-position', 'Position (facultative)', (lb) => seg({
      labelledBy: lb, options: CERVIX_POSITION, get: () => form.cervixPosition, set: (v) => { form.cervixPosition = v },
    }), 'La position n\'entre pas dans le calcul.'),
    h('p', { class: 'hint' }, 'Seul l\'état « fermé et dur » est considéré comme infertile. Une observation par jour, même doigt, même position.'),
  )

  // =========================================================================
  // 4. Tests

  const lastRiskySex = () => {
    let last = isRiskySex() ? date : null
    if (!last) {
      for (let i = dayKeys.length - 1; i >= 0; i--) {
        const k = dayKeys[i]
        if (k < date && RISKY_SEX.has(days[k].sex)) { last = k; break }
      }
    }
    return last
  }

  const secTests = section({
    key: 'tests',
    title: 'Tests',
    iconName: 'test',
    open: false,
    summary: () => {
      const parts = []
      if (form.lh) parts.push(`LH ${form.lh === 'positif' ? 'positif' : 'négatif'}`)
      if (form.pregnancyTest) parts.push(`Grossesse ${form.pregnancyTest === 'positif' ? 'positif' : 'négatif'}`)
      return parts.length ? parts.join(' · ') : 'Aucun'
    },
  })
  fill(secTests.body,
    labelled('log-lh', 'Test d\'ovulation (LH)', (lb) => seg({
      labelledBy: lb, options: LH_RESULTS, get: () => form.lh, set: (v) => { form.lh = v },
    }), 'Un test LH ne rend jamais un jour infertile : un négatif ne veut pas dire « pas fertile ». Évite l\'urine du premier matin.'),
    labelled('log-pregnancy', 'Test de grossesse', (lb) => seg({
      labelledBy: lb, options: PREGNANCY_TEST_RESULTS, get: () => form.pregnancyTest, set: (v) => { form.pregnancyTest = v },
    })),
    slot(() => form.pregnancyTest || '', () => {
      if (form.pregnancyTest === 'positif') {
        return alertBox('urgent', 'alert', 'Test positif',
          h('p', {}, 'Un test positif est presque toujours juste. Douleur dans le bas du ventre (souvent d\'un côté), saignement, douleur au bout de l\'épaule, vertiges ou malaise : appelle le 15 ou le 112 sans attendre.'),
          h('div', { class: 'row' },
            h('button', {
              type: 'button',
              class: 'btn btn--sm',
              on: { click: () => leave('comprendre', { article: 'test-positif' }) },
            }, icon('book', { size: 18 }), 'Test positif : et maintenant ?')))
      }
      if (form.pregnancyTest === 'negatif') {
        const last = lastRiskySex()
        const d = last ? diffDays(last, date) : null
        if (d !== null && d < PREGNANCY_TEST_DELAY_DAYS) {
          return alertBox('info', 'info', 'Test non concluant pour l\'instant',
            h('p', {}, `Un test fait moins de 21 jours après un rapport non protégé ne peut pas exclure une grossesse. Refais-en un à partir du ${fmtDate(addDays(last, PREGNANCY_TEST_DELAY_DAYS), 'long')}.`))
        }
      }
      return null
    }),
  )

  // =========================================================================
  // 5. Rapports

  const showSex = settings.showSexLog !== false || !!entry.sex
  let secSex = null
  if (showSex) {
    const sexOptions = [{ id: null, label: 'Aucun' }, ...SEX_OPTIONS.map((o) => ({ ...o, label: o.id === 'incident' ? 'Incident' : o.label }))]
    secSex = section({
      key: 'rapports',
      title: 'Rapports',
      iconName: 'heart',
      open: false,
      summary: () => {
        if (!form.sex) return 'Aucun'
        const label = SEX_OPTIONS.find((o) => o.id === form.sex)?.label || form.sex
        return form.sexTime ? `${label} · ${form.sexTime}` : label
      },
    })

    // Ce rapport demandait-il une protection ? Verdict K2 : ne dépend que du statut du jour et
    // de l'heure du rapport (jamais de l'heure de la saisie). Statut absent ou cycle 0 : oui.
    const protectionNeeded = () => sexNeedsProtection(status, form.sexTime, { cycle0: isCycle0 })

    async function openEmergency() {
      if (await commit()) ctx.navigate('urgence', { date, time: TIME_RE.test(form.sexTime) ? form.sexTime : null })
    }

    fill(secSex.body,
      labelled('log-sex', 'Rapport', (lb) => seg({
        labelledBy: lb,
        options: sexOptions,
        layout: 'grid2',
        get: () => form.sex,
        set: (v) => { form.sex = v },
      }), 'Incident : préservatif rompu ou glissé.'),
      showWhen(timeField('log-sex-time', 'Heure (si tu la connais)', () => form.sexTime, (v) => { form.sexTime = v }), () => !!form.sex),
      slot(() => (isRiskySex() ? `risque|${protectionNeeded()}` : ''), () => {
        if (!isRiskySex()) return null
        if (protectionNeeded()) {
          return alertBox('urgent', 'shield', 'Contraception d\'urgence possible',
            h('p', {}, 'Ce jour demandait une protection. Une contraception d\'urgence peut éviter une grossesse, et plus elle est prise tôt, mieux c\'est : DIU au cuivre (le plus efficace, jusqu\'à 120 h), ulipristal (120 h) ou lévonorgestrel (72 h).'),
            h('div', { class: 'row' },
              h('button', { type: 'button', class: 'btn btn--primary btn--sm', on: { click: openEmergency } },
                icon('shield', { size: 18 }), 'Enregistrer et voir quoi faire')))
        }
        return alertBox('info', 'info', null,
          h('p', {}, 'Selon les règles, ce jour ne demandait pas de protection. En cas de doute, le parcours urgence reste accessible.'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: openEmergency } }, 'Ouvrir le parcours urgence')))
      }),
    )
  }

  // =========================================================================
  // 6. Contraception d'urgence prise

  const secEc = section({
    key: 'cu',
    title: 'Contraception d\'urgence prise',
    iconName: 'pill',
    open: false,
    summary: () => {
      if (!form.emergencyContraception) return 'Aucune'
      const label = EC_LABELS[form.emergencyContraception] || EMERGENCY_CONTRACEPTIONS.find((o) => o.id === form.emergencyContraception)?.label
      return form.emergencyContraceptionTime ? `${label} · ${form.emergencyContraceptionTime}` : label
    },
  })
  fill(secEc.body,
    labelled('log-ec', 'Type', (lb) => seg({
      labelledBy: lb,
      options: EMERGENCY_CONTRACEPTIONS.map((o) => ({ ...o, label: EC_LABELS[o.id] || o.label })),
      layout: 'list',
      get: () => form.emergencyContraception,
      set: (v) => { form.emergencyContraception = v },
    })),
    showWhen(timeField('log-ec-time', 'Heure de la prise ou de la pose', () => form.emergencyContraceptionTime, (v) => { form.emergencyContraceptionTime = v }), () => !!form.emergencyContraception),
    slot(() => String(!!form.emergencyContraception), () => (form.emergencyContraception
      ? alertBox('attention', 'shield', 'Tous les jours resteront fertiles jusqu\'à tes prochaines vraies règles.',
        h('p', {}, 'Préservatif à chaque rapport d\'ici là : la pilule d\'urgence retarde souvent l\'ovulation sans l\'empêcher. Un spotting ne suffit pas, il faut de vraies règles. Vomissements dans les 3 h après la prise : reprends un comprimé.'))
      : null)),
  )

  // =========================================================================
  // 7. Ressenti

  const painValue = h('output', { id: 'log-pain-value', class: 'log-pain__value mono', attrs: { for: 'log-pain' } })
  const painInput = h('input', {
    type: 'range',
    id: 'log-pain',
    class: 'log-pain__range',
    min: 0,
    max: 10,
    step: 1,
    value: form.pain ?? 0,
    on: { input: (e) => { form.pain = Number(e.target.value); refresh() } },
  })
  const painClear = h('button', {
    type: 'button',
    class: 'btn btn--ghost btn--sm',
    on: { click: () => { form.pain = null; painInput.value = 0; refresh(); painInput.focus() } },
  }, 'Effacer')
  refreshers.push(() => {
    const text = form.pain === null ? 'Non notée' : `${form.pain} / 10`
    painValue.textContent = text
    painInput.setAttribute('aria-valuetext', text)
    painInput.classList.toggle('is-unset', form.pain === null)
    painClear.hidden = form.pain === null
  })

  const secFeel = section({
    key: 'ressenti',
    title: 'Ressenti',
    iconName: 'sun',
    open: false,
    summary: () => {
      const parts = []
      if (form.pain !== null) parts.push(`Douleur ${form.pain}/10`)
      if (form.symptoms.length) parts.push(`${form.symptoms.length} ${plural(form.symptoms.length, 'symptôme')}`)
      if (form.moods.length) parts.push(`${form.moods.length} ${plural(form.moods.length, 'humeur')}`)
      return parts.length ? parts.join(' · ') : 'Rien de noté'
    },
  })
  fill(secFeel.body,
    h('div', { class: 'field' },
      h('div', { class: 'spread' },
        h('label', { class: 'label', htmlFor: 'log-pain' }, 'Douleur'),
        h('span', { class: 'row' }, painValue, painClear)),
      painInput,
      h('div', { class: 'spread hint', ariaHidden: 'true' }, h('span', {}, '0 : aucune'), h('span', {}, '10 : maximale'))),
    labelled('log-symptoms', 'Symptômes', (lb) => chips({
      labelledBy: lb, options: SYMPTOMS, get: () => form.symptoms, set: (v) => { form.symptoms = v },
    })),
    labelled('log-moods', 'Humeur', (lb) => chips({
      labelledBy: lb, options: MOODS, get: () => form.moods, set: (v) => { form.moods = v },
    })),
  )

  // =========================================================================
  // 8. Cycle

  async function declareUnevaluable() {
    const ok = await ui.confirm({
      title: 'Déclarer ce cycle non évaluable ?',
      text: 'À partir de ce jour, le cycle sera **entièrement considéré comme fertile**, et le cycle suivant le sera dès son 1er jour. À utiliser en cas de perturbation prolongée (décalage horaire, maladie de plusieurs jours), de changement de thermomètre ou de courbe trop instable. Pense à enregistrer ensuite.',
      confirmLabel: 'Déclarer non évaluable',
    })
    if (!ok) return
    form.cycleUnevaluable = true
    refresh()
    document.getElementById('log-unevaluable-state')?.focus()
  }

  const secCycle = section({
    key: 'cycle',
    title: 'Cycle',
    iconName: 'calendar',
    open: false,
    summary: () => {
      const parts = []
      if (form.events.length) parts.push(`${form.events.length} ${plural(form.events.length, 'événement')}`)
      if (form.cycleUnevaluable) parts.push('non évaluable')
      return parts.length ? parts.join(' · ') : 'Rien de signalé'
    },
  })
  fill(secCycle.body,
    labelled('log-events', 'Événements', (lb) => chips({
      labelledBy: lb, options: CYCLE_EVENTS, get: () => form.events, set: (v) => { form.events = v },
    }), 'Un événement marque le cycle comme atypique (exclu des prévisions).'),
    cycle?.flags?.unevaluable && !entry.cycleUnevaluable
      ? alertBox('info', 'info', null, h('p', {},
        `Ce cycle est déjà non évaluable${cycle.flags.unevaluableFrom ? ` depuis le ${fmtDate(cycle.flags.unevaluableFrom, 'long')}` : ''}${cycle.flags.unevaluableReason ? ` : ${cycle.flags.unevaluableReason}` : '.'}`))
      : null,
    slot(() => String(form.cycleUnevaluable), () => {
      if (form.cycleUnevaluable) {
        return h('div', { class: 'stack stack--sm' },
          h('div', { id: 'log-unevaluable-state', tabIndex: -1 },
            alertBox('attention', 'x', 'Cycle déclaré non évaluable à partir de ce jour',
              h('p', {}, 'Il reste entièrement fertile, et le cycle suivant le sera dès son 1er jour.'))),
          h('div', { class: 'row' },
            h('button', {
              type: 'button',
              class: 'btn btn--ghost btn--sm',
              on: { click: () => { form.cycleUnevaluable = false; refresh(); document.getElementById('log-unevaluable-btn')?.focus() } },
            }, 'Annuler la déclaration')))
      }
      return h('div', { class: 'stack stack--sm' },
        h('p', { class: 'hint' }, 'Perturbation qui dure (voyage avec décalage horaire, maladie), changement de thermomètre ou courbe instable : tu peux déclarer le cycle non évaluable. Il sera alors entièrement fertile.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', id: 'log-unevaluable-btn', class: 'btn btn--sm', on: { click: declareUnevaluable } },
            'Déclarer ce cycle non évaluable')))
    }),
  )

  // =========================================================================
  // 9. Notes

  const notesCount = h('span', { class: 'hint mono', id: 'log-notes-count' })
  const notesInput = h('textarea', {
    id: 'log-notes',
    class: 'input',
    value: form.notes,
    maxLength: NOTES_MAX,
    rows: 4,
    ariaDescribedby: 'log-notes-count',
    on: { input: (e) => { form.notes = e.target.value; refresh() } },
  })
  refreshers.push(() => { notesCount.textContent = `${form.notes.length} / ${NOTES_MAX}` })

  const secNotes = section({
    key: 'notes',
    title: 'Notes',
    iconName: 'edit',
    open: false,
    summary: () => {
      const t = form.notes.trim()
      if (!t) return 'Aucune note'
      return t.length > 40 ? `${t.slice(0, 40)}…` : t
    },
  })
  fill(secNotes.body,
    h('div', { class: 'field' },
      h('div', { class: 'spread' }, h('label', { class: 'label', htmlFor: 'log-notes' }, 'Notes du jour'), notesCount),
      notesInput),
  )

  // =========================================================================
  // Enregistrement

  const saveError = h('p', { class: 'log-error log-savebar__error', role: 'alert' })
  saveError.hidden = true
  const saveState = h('span', { class: 'log-savebar__state' })
  refreshers.push(() => {
    const dirty = isDirty()
    saveState.textContent = dirty ? 'Non enregistré' : (saved ? 'Enregistré' : 'Rien de noté')
    saveState.dataset.dirty = String(dirty)
    saveError.textContent = ''
    saveError.hidden = true
  })

  function firstProblem() {
    const s = form.tempStr.trim()
    if (s) {
      if (tempInputError(s)) {
        tempTouched = true
        return { msg: 'Corrige la température avant d\'enregistrer.', target: () => tempInput }
      }
      const c = parseTemp(s)
      if (tempUnusual(c) && form.tempConfirmed !== c) {
        return { msg: 'Confirme la température inhabituelle avant d\'enregistrer.', target: () => document.getElementById('log-temp-confirm') }
      }
    }
    if (j1QuestionVisible()) {
      return { msg: 'Réponds à la question « Est-ce le 1er jour de tes règles ? » avant d\'enregistrer.', target: () => j1Yes }
    }
    return null
  }

  /** Affiche un message (et éventuellement un bouton) dans la barre d'enregistrement. */
  function showSaveMessage(msg, button = null) {
    saveError.replaceChildren(h('span', {}, msg), ...(button ? [' ', button] : []))
    saveError.hidden = false
  }

  /**
   * Formulaire ouvert « aujourd'hui » mais la date de l'horloge a changé depuis (nuit passée) :
   * on demande sur quel jour enregistrer, sans jamais réattribuer la saisie en silence.
   * @returns {Promise<boolean>} true si on enregistre sur la date affichée
   */
  async function confirmDayAfterMidnight() {
    if (!isToday) return true
    const clockToday = todayParts().today
    if (clockToday === date || clockToday < date) return true
    const gap = diffDays(date, clockToday)
    const shown = `${fmtDate(date, 'long')}${gap === 1 ? ' (hier)' : ''}`
    let ok = false
    try {
      ok = await ui.confirm({
        title: `Enregistrer sur le ${shown} ?`,
        text: `On est maintenant le ${fmtDate(clockToday, 'long')}. Ce formulaire a été ouvert le ${fmtDate(date, 'long')} : vérifie que tes observations concernent bien ce jour-là.`,
        confirmLabel: `Enregistrer sur le ${fmtDate(date, 'court')}`,
        cancelLabel: 'Ne pas enregistrer',
      })
    } catch {
      ok = false
    }
    if (!ok) {
      showSaveMessage('Rien n\'a été enregistré.', h('button', {
        type: 'button',
        class: 'btn btn--sm btn--ghost',
        id: 'log-reopen-today',
        on: { click: () => ctx.navigate('noter', { date: todayParts().today }) },
      }, 'Rouvrir sur aujourd\'hui'))
    }
    return ok
  }

  /**
   * J1 confirmé ce jour alors qu'un J1 est déjà noté le lendemain ou le surlendemain (même
   * période) : on propose de retirer l'autre (un seul 1er jour par période de règles).
   */
  async function resolveDuplicateJ1(built) {
    if (built.cycleStart !== true || entry.cycleStart === true) return
    for (const other of nearbyLaterJ1(days, date)) {
      let ok = false
      try {
        ok = await ui.confirm({
          title: `Retirer le J1 du ${fmtDate(other, 'long')} ?`,
          text: `Le ${fmtDate(other, 'long')} est déjà noté comme 1er jour de règles. Une même période de règles n'a qu'un seul 1er jour : si tes règles ont commencé le ${fmtDate(date, 'long')}, retire le J1 du ${fmtDate(other, 'long')}.`,
          confirmLabel: 'Retirer l\'autre J1',
          cancelLabel: 'Garder les deux',
        })
      } catch {
        ok = false
      }
      if (ok) {
        const { cycleStart, ...rest } = days[other]
        actions.saveDay(other, rest)
      }
    }
  }

  /** Valide puis enregistre ; renvoie false si une correction est nécessaire ou si rien n'est enregistré. */
  async function commit() {
    const problem = firstProblem()
    if (problem) {
      refresh()
      saveError.textContent = problem.msg
      saveError.hidden = false
      reveal(problem.target())
      return false
    }
    if (!(await confirmDayAfterMidnight())) return false
    const built = buildEntry()
    await resolveDuplicateJ1(built)
    pendingCelebration = { date, at: Date.now() }
    const clean = actions.saveDay(date, built)
    // La vue reconstruite par saveDay a déjà consommé la célébration ; sinon (pas de re-rendu),
    // on la joue sur le bouton encore affiché.
    const stillPending = pendingCelebration !== null
    pendingCelebration = null
    if (clean && stillPending) celebrate(saveBtn)
    ui.toast(clean ? 'Jour enregistré' : 'Jour vidé : plus rien n\'est noté')
    return true
  }

  async function clearDay() {
    const ok = await ui.confirm({
      title: 'Effacer ce jour ?',
      text: `Toutes les observations du ${fmtDate(date, 'long')} seront supprimées. Cette action est définitive.`,
      confirmLabel: 'Effacer',
      danger: true,
    })
    if (!ok) return
    actions.deleteDay(date)
    ui.toast('Jour effacé')
  }

  const saveBtn = h('button', { type: 'button', class: 'btn btn--primary log-savebar__btn', on: { click: () => commit() } },
    icon('check', { size: 20 }), 'Enregistrer')
  const saveBar = h('div', { class: 'log-savebar' },
    saveError,
    h('div', { class: 'log-savebar__row' },
      saveState,
      h('span', { class: 'log-savebar__btnwrap' }, saveBtn)))

  const footer = h('footer', { class: 'log-foot stack stack--sm' },
    h('p', { class: 'log-prudence' }, icon('eye', { size: 18 }), h('span', {}, 'Saisis seulement ce que tu as réellement observé.')),
    saved
      ? h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm log-foot__delete', on: { click: clearDay } },
          icon('trash', { size: 18 }), 'Effacer ce jour'))
      : null)

  root.append(h('div', { class: 'v-log stack' },
    head,
    secBleeding.el,
    secTemp.el,
    mucusMain ? secMucus.el : null,
    secCervix.el,
    mucusMain ? null : secMucus.el,
    secTests.el,
    secSex ? secSex.el : null,
    secEc.el,
    secFeel.el,
    secCycle.el,
    secNotes.el,
    footer,
    saveBar))

  refresh()

  // Enregistrement qui vient de reconstruire cette vue : la célébration se joue ici, une fois.
  const celebration = pendingCelebration
  if (celebration && celebration.date === date && saved && Date.now() - celebration.at < 2000) {
    pendingCelebration = null
    celebrate(saveBtn)
  }
}
