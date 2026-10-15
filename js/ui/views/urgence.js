// Vue « Préservatif rompu ou rapport non protégé » : parcours guidé de contraception d'urgence.
// Route 'urgence' { date?, time? }. Règles : spec §6.3 (codage 1 à 9), §6.2, §6.4, §3.1.4, §5.1.
// Les délais sont calculés en temps absolu à partir d'objets Date construits en heure locale :
// le changement d'heure (25/10) est donc compté correctement.

import {
  h, icon, fmtDate, addDays, diffDays, todayParts, EMERGENCY_CONTRACEPTIONS,
} from '../dom.js'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const HOUR_MS = 3600000
const MINUTE_MS = 60000
const NBSP = ' '
const RISKY_SEX = new Set(['non_protege', 'incident'])
const FUTURE_TOLERANCE_MS = 5 * MINUTE_MS
const COPPER_IUD_H = 120
const ULIPRISTAL_H = 120
const LEVONORGESTREL_H = 72
const LEVONORGESTREL_OFF_LABEL_H = 96
const PILL_COVER_H = 120
const TPE_BEST_H = 4
const TPE_LATEST_H = 48
const PREGNANCY_TEST_DAYS = 21
const HORMONAL_RESIDUAL_DAYS = 7
const PRE_REMOVAL_WINDOW_DAYS = 7
/** Au-delà, un brouillon resté ouvert est recréé (application laissée en arrière-plan). */
const DRAFT_MAX_AGE_MS = 6 * HOUR_MS
const GREEN_LINE = { label: 'Numéro vert « Sexualités, contraception, IVG »', display: '0 800 08 11 11', tel: '0800081111' }

/** Libellés des options de contraception d'urgence (ordre recommandé, spec §6.3 règle 1). */
export const OPTION_TEXT = {
  diu_cuivre: {
    title: 'DIU au cuivre',
    lead: 'Le plus efficace : moins de 0,1 % de grossesses (moins d\'une sur 1 000).',
    where: 'Prescription et pose par un médecin, une sage-femme ou un centre de santé sexuelle. 30,50 €, pris en charge à 100 % avant 26 ans, 65 % ensuite. Appelle vite pour obtenir un rendez-vous dans le délai.',
    windowNote: 'Délai compté depuis le premier rapport non protégé du cycle.',
  },
  ulipristal: {
    title: 'Ulipristal 30 mg (ellaOne)',
    lead: 'La pilule la plus efficace : environ 1 à 2 % de grossesses.',
    where: 'En pharmacie, gratuite et sans ordonnance, pour toutes.',
    windowNote: null,
  },
  levonorgestrel: {
    title: 'Lévonorgestrel 1,5 mg',
    lead: 'Environ 0,6 à 2,6 % de grossesses, de moins en moins efficace à mesure qu\'on attend : de préférence dans les 12 h.',
    where: 'En pharmacie, gratuite et sans ordonnance, pour toutes.',
    windowNote: null,
  },
}

const STATE_META = {
  possible: { label: 'Encore possible', icon: 'check', cls: 'ok' },
  hors_amm: { label: 'Hors autorisation, moins efficace', icon: 'alert', cls: 'warn' },
  depasse: { label: 'Délai dépassé', icon: 'x', cls: 'past' },
}

const EC_LABELS = {
  levonorgestrel: 'Lévonorgestrel 1,5 mg',
  ulipristal: 'Ulipristal 30 mg (ellaOne)',
  diu_cuivre: 'DIU au cuivre',
}

// ---------------------------------------------------------------------------
// Fonctions pures (testables sous Node)

const pad2 = (n) => String(n).padStart(2, '0')

/**
 * Date + heure locales de l'appareil → objet Date. Heure absente ou invalide → 00:00.
 * @param {string} iso 'YYYY-MM-DD'
 * @param {string|null} [time] 'HH:MM'
 * @returns {Date|null} null si la date est invalide
 */
export function localDateTime(iso, time) {
  const m = typeof iso === 'string' ? ISO_RE.exec(iso) : null
  if (!m) return null
  const t = typeof time === 'string' ? TIME_RE.exec(time) : null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mo, d, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, 0, 0)
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null
  return date
}

/**
 * Instant → « mardi 7 octobre 14 h 30 » (heure locale de l'appareil).
 * @param {Date} date
 * @returns {string}
 */
export function fmtDeadline(date) {
  const iso = todayParts(date).today
  const mm = date.getMinutes()
  return `${fmtDate(iso, 'long')} ${date.getHours()}${NBSP}h${mm ? `${NBSP}${pad2(mm)}` : ''}`
}

/**
 * Durée → « 3 j 21 h », « 5 h 12 min », « 8 min ».
 * @param {number} ms durée positive
 * @returns {string}
 */
export function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / MINUTE_MS))
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}${NBSP}j${hours ? ` ${hours}${NBSP}h` : ''}`
  if (hours > 0) return `${hours}${NBSP}h${mins ? ` ${pad2(mins)}${NBSP}min` : ''}`
  return `${mins}${NBSP}min`
}

/**
 * Calcule les délais de contraception d'urgence (spec §6.3) et du TPE (§6.2).
 *
 * @param {object} input
 * @param {{ date: string, time: string|null }} input.report  rapport à risque (le plus récent) ; heure inconnue → 00:00
 * @param {{ date: string, time: string|null }|null} [input.first]  premier RNP du cycle, s'il est antérieur
 * @param {Date} input.now instant présent
 * @returns {{ ok: false, error: 'report_invalid'|'report_future' } | {
 *   ok: true,
 *   reportAt: Date, firstAt: Date, hasEarlier: boolean, firstError: null|'first_invalid'|'first_after_report',
 *   sinceReportMs: number, sinceFirstMs: number,
 *   options: Array<{ id: string, deadline: Date, offLabelDeadline: Date|null, state: 'possible'|'hors_amm'|'depasse', remainingMs: number }>,
 *   recommended: string|null, allPast: boolean, earlierNotCoveredByPills: boolean, oldRisk: boolean,
 *   testDate: string, tpe: { best: Date, latest: Date, state: 'ideal'|'possible'|'depasse' },
 * }}
 */
export function computeEmergencyPlan({ report, first = null, now }) {
  const reportAt = localDateTime(report?.date, report?.time)
  if (!reportAt) return { ok: false, error: 'report_invalid' }
  if (reportAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return { ok: false, error: 'report_future' }

  let firstAt = reportAt
  let firstError = null
  let firstDate = report.date
  if (first && (first.date || first.time)) {
    const candidate = localDateTime(first.date, first.time)
    if (!candidate) firstError = 'first_invalid'
    else if (candidate.getTime() > reportAt.getTime()) firstError = 'first_after_report'
    else {
      firstAt = candidate
      firstDate = first.date
    }
  }

  const t = now.getTime()
  const plus = (d, hours) => new Date(d.getTime() + hours * HOUR_MS)
  const sinceReportMs = t - reportAt.getTime()
  const sinceFirstMs = t - firstAt.getTime()

  const copper = plus(firstAt, COPPER_IUD_H)
  const upa = plus(reportAt, ULIPRISTAL_H)
  const lng = plus(reportAt, LEVONORGESTREL_H)
  const lngOff = plus(reportAt, LEVONORGESTREL_OFF_LABEL_H)
  const stateOf = (deadline) => (t <= deadline.getTime() ? 'possible' : 'depasse')
  let lngState = stateOf(lng)
  if (lngState === 'depasse' && t <= lngOff.getTime()) lngState = 'hors_amm'

  const options = [
    { id: 'diu_cuivre', deadline: copper, offLabelDeadline: null, state: stateOf(copper) },
    { id: 'ulipristal', deadline: upa, offLabelDeadline: null, state: stateOf(upa) },
    { id: 'levonorgestrel', deadline: lng, offLabelDeadline: lngOff, state: lngState },
  ].map((o) => ({
    ...o,
    remainingMs: (o.state === 'hors_amm' ? o.offLabelDeadline : o.deadline).getTime() - t,
  }))

  const tpeBest = plus(reportAt, TPE_BEST_H)
  const tpeLatest = plus(reportAt, TPE_LATEST_H)
  const todayIso = todayParts(now).today

  return {
    ok: true,
    reportAt,
    firstAt,
    hasEarlier: firstAt.getTime() < reportAt.getTime(),
    firstError,
    sinceReportMs,
    sinceFirstMs,
    options,
    recommended: options.find((o) => o.state === 'possible')?.id ?? null,
    allPast: options.every((o) => o.state === 'depasse'),
    earlierNotCoveredByPills: firstAt.getTime() < reportAt.getTime() && sinceFirstMs > PILL_COVER_H * HOUR_MS,
    oldRisk: diffDays(firstDate, todayIso) > PREGNANCY_TEST_DAYS,
    testDate: addDays(report.date, PREGNANCY_TEST_DAYS),
    tpe: {
      best: tpeBest,
      latest: tpeLatest,
      state: t <= tpeBest.getTime() ? 'ideal' : t <= tpeLatest.getTime() ? 'possible' : 'depasse',
    },
  }
}

/**
 * Premier rapport non protégé (ou incident) déjà noté dans le suivi, entre `fromIso` inclus
 * et `beforeIso` exclu.
 * @param {object} days AppData.days
 * @param {string|null} fromIso
 * @param {string} beforeIso
 * @returns {{ date: string, time: string|null }|null}
 */
export function firstRecordedRisk(days, fromIso, beforeIso) {
  if (!fromIso || !days) return null
  const found = Object.keys(days)
    .filter((iso) => iso >= fromIso && iso < beforeIso && RISKY_SEX.has(days[iso]?.sex))
    .sort()[0]
  if (!found) return null
  const time = days[found].sexTime
  return { date: found, time: typeof time === 'string' && TIME_RE.test(time) ? time : null }
}

/**
 * Dernier rapport à risque noté dans le suivi depuis `fromIso`, survenu il y a 0 à 120 h
 * (heure inconnue → 00:00 ce jour-là, comme l'alerte « Contraception d'urgence possible »).
 * @param {object} days AppData.days
 * @param {string|null} fromIso borne basse incluse (null : aucune)
 * @param {Date} now
 * @returns {{ date: string, time: string|null }|null}
 */
export function lastRecentRisk(days, fromIso, now) {
  if (!days || !(now instanceof Date)) return null
  const t = now.getTime()
  let best = null
  for (const iso of Object.keys(days)) {
    if (fromIso && iso < fromIso) continue
    const e = days[iso]
    if (!RISKY_SEX.has(e?.sex)) continue
    const time = typeof e.sexTime === 'string' && TIME_RE.test(e.sexTime) ? e.sexTime : null
    const at = localDateTime(iso, time)
    if (!at) continue
    const since = t - at.getTime()
    if (since < 0 || since >= ULIPRISTAL_H * HOUR_MS) continue
    if (!best || at.getTime() > best.at) best = { date: iso, time, at: at.getTime() }
  }
  return best ? { date: best.date, time: best.time } : null
}

/**
 * Jour à enregistrer pour un rapport : l'heure n'est écrite que si elle est connue et valide ;
 * sinon l'heure d'un autre rapport déjà noté ce jour-là est retirée (jamais gardée en silence).
 * @param {object|null} prev entrée existante du jour
 * @param {'incident'|'non_protege'} sexKind
 * @param {string} time 'HH:MM'
 * @param {boolean} timeUnknown
 * @returns {object}
 */
export function reportEntry(prev, sexKind, time, timeUnknown) {
  const entry = { ...(prev || {}), sex: sexKind }
  if (!timeUnknown && typeof time === 'string' && TIME_RE.test(time)) entry.sexTime = time
  else delete entry.sexTime
  return entry
}

// ---------------------------------------------------------------------------
// Brouillon : conservé entre deux rendus (enregistrement, rafraîchissement horaire), jamais
// d'une ouverture du parcours à l'autre.

let draft = null
let draftMeta = null // { key, createdAt, data }

/**
 * Brouillon initial du parcours. L'heure actuelle n'est JAMAIS prise pour celle du rapport :
 * 1. route { date, time } valides : on les reprend ;
 * 2. route { date } sans heure valide : heure du rapport à risque noté ce jour-là, sinon heure inconnue (00:00) ;
 * 3. sans paramètres : dernier rapport à risque noté depuis les dernières règles, de moins de 120 h
 *    (mention « Pré-rempli d'après ton suivi ») ;
 * 4. rien trouvé : aujourd'hui, heure inconnue (00:00), et un bouton « C'est arrivé à l'instant ».
 * @param {object} ctx contexte des vues
 * @param {Date} [now]
 * @returns {object}
 */
export function newDraft(ctx, now = new Date()) {
  const params = ctx?.route?.params || {}
  const nowParts = todayParts(now)
  const days = ctx?.data?.days || {}
  const validTime = (t) => typeof t === 'string' && TIME_RE.test(t)
  const paramDate = typeof params.date === 'string' && localDateTime(params.date) && params.date <= nowParts.today
    ? params.date
    : null

  let date = nowParts.today
  let time = ''
  let source = 'aucun'
  if (paramDate) {
    date = paramDate
    source = 'params'
    if (validTime(params.time)) time = params.time
    else {
      const e = days[paramDate]
      if (e && RISKY_SEX.has(e.sex) && validTime(e.sexTime)) time = e.sexTime
    }
  } else {
    const found = lastRecentRisk(days, referenceStart(ctx, nowParts.today), now)
    if (found) {
      date = found.date
      time = found.time || ''
      source = 'suivi'
    }
  }

  const d = {
    date,
    time,
    timeUnknown: !time,
    source, // 'params' | 'suivi' | 'aucun' | 'instant' | 'manuel'
    others: null, // 'oui' | 'non' | 'nsp'
    firstDate: '',
    firstTime: '',
    firstTimeUnknown: false,
    firstFromLog: false,
    sexKind: 'incident',
    saveFirst: true,
    reportSaved: null,
    ecOpen: false,
    ecType: null,
    ecDate: nowParts.today,
    ecTime: nowParts.time,
    ecSaved: null,
  }
  if (source === 'suivi' || source === 'params') {
    const kind = days[date]?.sex
    if (RISKY_SEX.has(kind)) d.sexKind = kind
  }
  const prior = firstRecordedRisk(days, referenceStart(ctx, date), date)
  if (prior) {
    d.others = 'oui'
    d.firstDate = prior.date
    d.firstTime = prior.time || ''
    d.firstTimeUnknown = !prior.time
    d.firstFromLog = true
  }
  return d
}

/**
 * Début de la période où chercher le premier rapport : début du cycle qui CONTIENT la date
 * (à défaut, le plus récent commencé avant elle ; sans analyse, le dernier J1 noté), ou le retrait
 * s'il est plus récent. Le retrait sert seul de repli quand aucun J1 ne précède la date.
 * @param {object} ctx contexte des vues
 * @param {string} beforeIso
 * @returns {string|null}
 */
export function referenceStart(ctx, beforeIso) {
  const valid = (x) => typeof x === 'string' && ISO_RE.test(x) && x <= beforeIso
  const cycles = Array.isArray(ctx?.analysis?.cycles) ? ctx.analysis.cycles.filter((c) => c && valid(c.start)) : []
  let start = cycles.find((c) => !c.end || beforeIso <= c.end)?.start
    || cycles.map((c) => c.start).sort().at(-1)
    || null
  if (!start) {
    const days = ctx?.data?.days || {}
    start = Object.keys(days).filter((k) => valid(k) && days[k]?.cycleStart === true).sort().at(-1) || null
  }
  const candidates = [start, ctx?.data?.profile?.iudRemovalDate].filter(valid)
  return candidates.length ? candidates.sort().at(-1) : null
}

/**
 * Le brouillon en mémoire vaut-il encore pour cet affichage ? Non s'il vient d'une autre
 * ouverture du parcours (K7 route.seq, paramètres), d'un autre jour, s'il a plus de quelques
 * heures, ou si les données ont été remplacées (effacement, import, démo).
 */
function draftUsable(ctx, key, now) {
  if (!draft || !draftMeta || draftMeta.key !== key) return false
  if (draftMeta.data !== (ctx.data || null)) return false
  if (todayParts(new Date(draftMeta.createdAt)).today !== todayParts(now).today) return false
  return now.getTime() - draftMeta.createdAt <= DRAFT_MAX_AGE_MS
}

// ---------------------------------------------------------------------------
// Contexte dérivé des données (tout est facultatif)

function deriveContext(ctx) {
  const data = ctx.data || {}
  const profile = data.profile || {}
  const analysis = ctx.analysis || null
  const today = ctx.now?.today || todayParts().today
  const days = data.days || {}

  const removal = ISO_RE.test(profile.iudRemovalDate || '') ? profile.iudRemovalDate : null
  // Heure du retrait inconnue : on considère le DIU en place jusqu'au soir (prudent pour l'alerte §3.1.4).
  const removalAt = removal ? localDateTime(removal, TIME_RE.test(profile.iudRemovalTime || '') ? profile.iudRemovalTime : '23:59') : null
  const sinceRemoval = removal ? diffDays(removal, today) : null
  const hormonalish = profile.iudType === 'hormonal' || profile.iudType === 'inconnu'

  const alerts = Array.isArray(analysis?.alerts) ? analysis.alerts : []
  const late = !!analysis?.predictions?.late || alerts.some((a) => /^(retard|amenorrhee):/.test(a?.id || ''))

  const current = analysis?.current || null
  const cycle = current && Array.isArray(analysis.cycles) ? analysis.cycles[current.cycleIndex] : null
  const ecThisCycle = cycle?.flags?.emergencyContraception || null

  // Prises récentes (précautions ulipristal / lévonorgestrel, spec §6.3 règle 6).
  const recentEc = (type, maxDays) => Object.keys(days).some((iso) => {
    const diff = diffDays(iso, today)
    return days[iso]?.emergencyContraception === type && diff !== null && diff >= 0 && diff <= maxDays
  })

  return {
    today,
    removal,
    removalAt,
    removalInFuture: !!removalAt && removalAt.getTime() > Date.now(),
    hormonalRecent: hormonalish && sinceRemoval !== null && sinceRemoval >= 0 && sinceRemoval <= HORMONAL_RESIDUAL_DAYS,
    iudType: profile.iudType || null,
    late,
    ecThisCycle,
    recentLng: recentEc('levonorgestrel', 7),
    recentUpa: recentEc('ulipristal', 5),
  }
}

// ---------------------------------------------------------------------------
// Petits composants

function sectionHead(num, title, id) {
  return h('header', { class: 'v-urg__head' },
    h('span', { class: 'v-urg__num mono', ariaHidden: 'true' }, String(num)),
    h('h2', { class: 'section-title', id }, title))
}

function alertBox(tone, iconName, title, ...body) {
  return h('div', { class: ['alert', `alert--${tone}`] },
    icon(iconName),
    h('div', { class: 'stack stack--sm' },
      title ? h('p', { class: 'alert__title' }, title) : null,
      ...body))
}

function stateTag(state) {
  const meta = STATE_META[state]
  return h('span', { class: ['v-urg__state', `v-urg__state--${meta.cls}`] },
    icon(meta.icon, { size: 16 }), h('span', {}, meta.label))
}

function telLink(number, display, label, primary = false) {
  return h('a', {
    class: ['btn', 'btn--sm', primary ? 'btn--primary' : null],
    href: `tel:${number}`,
    ariaLabel: label,
  }, icon('phone', { size: 18 }), display)
}

async function copyText(text, node, ui) {
  try {
    await navigator.clipboard.writeText(text)
    ui?.toast?.('Numéro copié.')
    return
  } catch {
    /* presse-papiers indisponible (aperçu, ancien navigateur) : on sélectionne le texte */
  }
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    ui?.toast?.('Numéro sélectionné : copie-le depuis le menu de ton téléphone.')
  } catch {
    ui?.toast?.(`Le numéro : ${text}`)
  }
}

// ---------------------------------------------------------------------------
// Rendu

/**
 * Affiche le parcours « Préservatif rompu ou rapport non protégé ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 * @returns {() => void} nettoyage (arrête le rafraîchissement des comptes à rebours)
 */
export function render(root, ctx) {
  const now = new Date()
  // Clé : entrée sur la route (K7 route.seq, absent = même ouverture) et paramètres.
  const key = `${ctx.route?.seq ?? ''}|${ctx.route?.params?.date || ''}|${ctx.route?.params?.time || ''}`
  if (!draftUsable(ctx, key, now)) {
    draft = newDraft(ctx, now)
    draftMeta = { key, createdAt: now.getTime(), data: ctx.data || null }
  }
  const d = draft
  const info = deriveContext(ctx)
  const refreshers = []
  const refresh = () => refreshers.forEach((fn) => fn())

  const plan = () => computeEmergencyPlan({
    report: { date: d.date, time: d.timeUnknown ? null : d.time },
    first: d.others === 'oui' ? { date: d.firstDate, time: d.firstTimeUnknown ? null : d.firstTime } : null,
    now: new Date(),
  })

  /** Contrôle segmenté à choix unique (boutons aria-pressed). */
  function seg(labelledBy, options, get, set, extraClass) {
    const el = h('div', { class: ['seg', extraClass], role: 'group', ariaLabelledby: labelledBy })
    const buttons = options.map((opt) => {
      const b = h('button', {
        type: 'button',
        class: 'seg__opt',
        ariaPressed: 'false',
        on: { click: () => { set(opt.id); refresh() } },
      }, opt.label)
      el.append(b)
      return [opt.id, b]
    })
    refreshers.push(() => {
      for (const [id, b] of buttons) {
        const on = get() === id
        b.setAttribute('aria-pressed', String(on))
        b.classList.toggle('is-on', on)
      }
    })
    return el
  }

  /** Date + heure + case « heure inconnue ». */
  function whenFields(prefix, get, set) {
    const maxDate = todayParts().today
    const dateInput = h('input', {
      type: 'date', id: `${prefix}-date`, class: 'input mono', max: maxDate, required: true, value: get().date,
      on: { input: (e) => { set({ date: e.target.value }); refresh() } },
    })
    const timeInput = h('input', {
      type: 'time', id: `${prefix}-time`, class: 'input mono', value: get().time,
      disabled: get().unknown,
      on: { input: (e) => { set({ time: e.target.value }); refresh() } },
    })
    const unknownBox = h('input', {
      type: 'checkbox', id: `${prefix}-time-unknown`, checked: get().unknown,
      on: {
        change: (e) => {
          set({ unknown: e.target.checked })
          timeInput.disabled = e.target.checked
          refresh()
        },
      },
    })
    const unknownHint = h('p', { class: 'hint', id: `${prefix}-time-hint` })
    refreshers.push(() => {
      const { unknown, time, date } = get()
      // Valeurs changées par un bouton (« C'est arrivé à l'instant ») : on met les champs à jour.
      if (dateInput.value !== (date || '')) dateInput.value = date || ''
      if (timeInput.value !== (time || '')) timeInput.value = time || ''
      if (unknownBox.checked !== !!unknown) unknownBox.checked = !!unknown
      if (timeInput.disabled !== !!unknown) timeInput.disabled = !!unknown
      unknownHint.hidden = !(unknown || !TIME_RE.test(time || ''))
      unknownHint.textContent = unknownHint.hidden
        ? ''
        : 'Sans heure, on compte à partir de 00 h 00 ce jour-là : les heures limites affichées ne seront jamais trop tardives.'
    })
    return h('div', { class: 'v-urg__when' },
      h('div', { class: 'v-urg__pair' },
        h('div', { class: 'field' }, h('label', { class: 'label', htmlFor: `${prefix}-date` }, 'Date'), dateInput),
        h('div', { class: 'field' }, h('label', { class: 'label', htmlFor: `${prefix}-time` }, 'Heure'), timeInput)),
      h('label', { class: 'v-urg__check', htmlFor: `${prefix}-time-unknown` }, unknownBox, h('span', {}, 'Je ne connais pas l\'heure')),
      unknownHint)
  }

  // 1. Introduction ----------------------------------------------------------
  const intro = h('section', { class: 'v-urg__intro card stack stack--sm', ariaLabelledby: 'urg-title' },
    h('span', { class: 'v-urg__buoy', ariaHidden: 'true' }, icon('buoy', { size: 30 })),
    h('p', { class: 'eyebrow' }, 'Préservatif rompu ou rapport non protégé'),
    h('h1', { class: 'v-urg__title display', id: 'urg-title' }, 'Respire : il existe des solutions efficaces.'),
    h('p', { class: 'v-urg__lead' }, 'Agis vite, mais sans paniquer : tu as des solutions, gratuites et sans ordonnance.'),
    h('div', { class: 'row' },
      jumpButton('urg-options', 'clock', 'Voir les délais'),
      jumpButton('urg-where', 'phone', 'Où aller')))

  // 2. Quand ? ---------------------------------------------------------------
  // Origine du rapport affiché : jamais de pré-remplissage silencieux avec l'heure actuelle.
  const prefillNote = h('p', { class: 'hint', id: 'urg-report-prefill' },
    icon('info', { size: 16 }), ' Pré-rempli d\'après ton suivi. Corrige si besoin.')
  const noneNote = h('p', { class: 'hint', id: 'urg-report-none' },
    'Aucun rapport à risque récent dans ton suivi : indique sa date et son heure.')
  const instantBtn = h('button', {
    type: 'button',
    id: 'urg-report-now',
    class: 'btn btn--sm',
    on: {
      click: () => {
        const p = todayParts()
        d.date = p.today
        d.time = p.time
        d.timeUnknown = false
        d.source = 'instant'
        d.reportSaved = null
        refresh()
      },
    },
  }, icon('clock', { size: 18 }), 'C\'est arrivé à l\'instant')
  const reportOrigin = h('div', { class: 'stack stack--sm v-urg__origin' }, prefillNote, noneNote, h('div', { class: 'row' }, instantBtn))
  refreshers.push(() => {
    prefillNote.hidden = d.source !== 'suivi'
    noneNote.hidden = d.source !== 'aucun'
    reportOrigin.hidden = d.source !== 'suivi' && d.source !== 'aucun'
  })

  const firstBlock = h('div', { class: 'stack stack--sm v-urg__first' },
    h('p', { class: 'hint', id: 'urg-first-help' }, 'Indique le PREMIER de ces rapports : le délai du DIU au cuivre se compte à partir de lui.'),
    whenFields('urg-first',
      () => ({ date: d.firstDate, time: d.firstTime, unknown: d.firstTimeUnknown }),
      (p) => {
        if ('date' in p) d.firstDate = p.date
        if ('time' in p) d.firstTime = p.time
        if ('unknown' in p) d.firstTimeUnknown = p.unknown
        d.firstFromLog = false
      }),
    d.firstFromLog
      ? h('p', { class: 'hint' }, icon('info', { size: 16 }), ` Pré-rempli d'après ton suivi (${fmtDate(d.firstDate, 'long')}). Corrige si besoin.`)
      : null)
  const nspNote = h('p', { class: 'hint' }, 'Pas de souci. Dis-le à la pharmacienne ou à la professionnelle : si un rapport plus ancien a eu lieu, le délai du DIU au cuivre se compte depuis lui.')
  refreshers.push(() => {
    firstBlock.hidden = d.others !== 'oui'
    nspNote.hidden = d.others !== 'nsp'
  })

  const when = h('section', { class: 'card stack', ariaLabelledby: 'urg-when-title' },
    sectionHead(1, 'Quand a eu lieu le rapport ?', 'urg-when-title'),
    h('p', { class: 'hint' }, 'Le rapport le plus récent. Modifie l\'heure s\'il a eu lieu plus tôt.'),
    whenFields('urg-report',
      () => ({ date: d.date, time: d.time, unknown: d.timeUnknown }),
      (p) => {
        if ('date' in p) d.date = p.date
        if ('time' in p) d.time = p.time
        if ('unknown' in p) d.timeUnknown = p.unknown
        d.reportSaved = null
        d.source = 'manuel'
      }),
    reportOrigin,
    h('div', { class: 'field' },
      h('span', { class: 'label', id: 'urg-others-label' }, 'Y a-t-il eu d\'autres rapports non protégés depuis tes dernières règles (ou depuis le retrait) ?'),
      seg('urg-others-label', [
        { id: 'non', label: 'Non' },
        { id: 'oui', label: 'Oui' },
        { id: 'nsp', label: 'Je ne sais pas' },
      ], () => d.others, (v) => { d.others = v })),
    firstBlock,
    nspNote)

  // 3. Les options et leurs délais --------------------------------------------
  const optionsBox = h('div', { class: 'stack' })
  const optionsSection = h('section', { class: 'card stack', id: 'urg-options', ariaLabelledby: 'urg-options-title', tabIndex: -1 },
    sectionHead(2, 'Tes options, de la plus efficace à la moins efficace', 'urg-options-title'),
    h('p', { class: 'hint' }, 'Cet ordre ne dépend pas de la phase de ton cycle, qui peut être mal estimée. Plus c\'est tôt, mieux c\'est.'),
    optionsBox)
  refreshers.push(() => optionsBox.replaceChildren(...optionsContent(plan(), info, d)))

  // 4. Où ? -----------------------------------------------------------------
  const numberEl = h('span', { class: 'v-urg__number mono' }, GREEN_LINE.display)
  const where = h('section', { class: 'card stack', id: 'urg-where', ariaLabelledby: 'urg-where-title', tabIndex: -1 },
    sectionHead(3, 'Où aller ?', 'urg-where-title'),
    h('ul', { class: 'v-urg__places' },
      place('pill', 'Pharmacie', 'Pilules d\'urgence gratuites et sans ordonnance, pour toutes. Inutile de prendre rendez-vous.'),
      place('home', 'Centre de santé sexuelle', 'Pilules, pose de DIU, conseils. Gratuit et anonyme pour les mineures et les personnes sans couverture sociale.'),
      place('heart', 'Sage-femme ou médecin', 'Prescription et pose du DIU au cuivre, pilules d\'urgence.')),
    h('div', { class: 'v-urg__line card--flat card' },
      h('p', { class: 'label' }, GREEN_LINE.label),
      numberEl,
      h('p', { class: 'hint' }, 'Gratuit et anonyme. Du lundi au samedi, 9 h–20 h en métropole. Pour trouver un centre près de chez toi ou poser une question.'),
      h('div', { class: 'row' },
        telLink(GREEN_LINE.tel, 'Appeler', `Appeler le ${GREEN_LINE.display}`, true),
        h('button', {
          type: 'button',
          class: 'btn btn--sm',
          ariaLabel: `Copier le numéro ${GREEN_LINE.display}`,
          on: { click: () => copyText(GREEN_LINE.display, numberEl, ctx.ui) },
        }, icon('copy', { size: 18 }), 'Copier'))),
    h('details', { class: 'v-urg__details' },
      h('summary', {}, 'Et le poids ?'),
      h('p', {}, 'Selon une recommandation britannique, les pilules pourraient être un peu moins efficaces au-delà de 70 kg (lévonorgestrel) ou de 85 kg (ulipristal). L\'agence européenne du médicament et la HAS jugent ces données non concluantes : les pilules restent utilisables quel que soit le poids. Si c\'est ton cas, le DIU au cuivre est d\'autant plus conseillé, mais une pilule vaut toujours mieux que rien.')))

  // 5. Après la prise ---------------------------------------------------------
  const afterBox = h('ul', { class: 'v-urg__list' })
  refreshers.push(() => afterBox.replaceChildren(...afterContent(plan(), info)))
  const after = h('section', { class: 'card stack', ariaLabelledby: 'urg-after-title' },
    sectionHead(4, 'Après la prise', 'urg-after-title'),
    afterBox)

  // 6. Risque d'IST / VIH -----------------------------------------------------
  const tpeBox = h('div', { class: 'stack stack--sm' })
  refreshers.push(() => tpeBox.replaceChildren(...tpeContent(plan())))
  const tpe = h('section', { class: 'card stack', ariaLabelledby: 'urg-tpe-title' },
    sectionHead(5, 'Et le risque d\'infection ?', 'urg-tpe-title'),
    tpeBox)

  // Signes d'urgence ----------------------------------------------------------
  const danger = h('section', { class: 'v-urg__danger', ariaLabelledby: 'urg-danger-title' },
    alertBox('urgent', 'alert', null,
      h('p', { class: 'alert__title', id: 'urg-danger-title' }, 'Appelle le 15 ou le 112 si tu as :'),
      h('ul', { class: 'v-urg__list v-urg__list--tight' },
        h('li', {}, 'une douleur intense dans le bas du ventre, surtout d\'un seul côté, ou au bout de l\'épaule ;'),
        h('li', {}, 'un malaise, des vertiges ou une grande faiblesse ;'),
        h('li', {}, 'un saignement abondant.')),
      h('p', {}, 'Un saignement n\'exclut pas une grossesse extra-utérine.'),
      h('div', { class: 'row' },
        telLink('15', '15', 'Appeler le 15 (SAMU)', true),
        telLink('112', '112', 'Appeler le 112 (numéro d\'urgence européen)'))))

  // 7. Garder une trace ---------------------------------------------------------
  const actions = actionsSection(ctx, d, plan, seg, refreshers, refresh)

  const links = h('section', { class: 'stack stack--sm', ariaLabelledby: 'urg-links-title' },
    h('h2', { class: 'eyebrow', id: 'urg-links-title' }, 'Pour aller plus loin'),
    h('div', { class: 'v-urg__links' },
      articleLink(ctx, 'contraception-urgence', 'Contraception d\'urgence : tout comprendre'),
      articleLink(ctx, 'test-grossesse', 'Test de grossesse : quand le faire'),
      articleLink(ctx, 'preservatif', 'Bien utiliser le préservatif')))

  const reset = h('div', { class: 'v-urg__reset' },
    h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      on: { click: () => { draft = null; ctx.navigate('urgence', {}) } },
    }, icon('edit', { size: 18 }), 'Recommencer avec un autre rapport'))

  root.append(h('div', { class: 'v-urg stack stack--lg' },
    intro, when, optionsSection, where, after, tpe, danger, actions, links, reset))
  refresh()

  // Les comptes à rebours avancent même si la page reste ouverte.
  let timer = null
  try {
    timer = setInterval(refresh, MINUTE_MS)
  } catch {
    timer = null
  }
  return () => { if (timer) clearInterval(timer) }
}

/** Bouton « aller à la section » (pas d'ancre : le hash est réservé au routeur). */
function jumpButton(targetId, iconName, label) {
  return h('button', {
    type: 'button',
    class: 'btn btn--ghost btn--sm',
    ariaControls: targetId,
    on: {
      click: () => {
        const target = document.getElementById(targetId)
        if (!target) return
        target.scrollIntoView({ block: 'start' })
        target.focus({ preventScroll: true })
      },
    },
  }, icon(iconName, { size: 18 }), label)
}

function place(iconName, title, text) {
  return h('li', { class: 'v-urg__place' },
    h('span', { class: ['v-urg__place-icon', `v-urg__place-icon--${iconName}`] }, icon(iconName)),
    h('div', {}, h('p', { class: 'v-urg__place-title' }, title), h('p', { class: 'hint' }, text)))
}

function articleLink(ctx, id, label) {
  return h('button', {
    type: 'button',
    class: 'btn btn--block v-urg__link',
    on: { click: () => ctx.navigate('comprendre', { article: id }) },
  }, icon('book', { size: 18 }), h('span', {}, label), icon('chevron-right', { size: 18 }))
}

// ---------------------------------------------------------------------------
// Contenus calculés

function optionsContent(p, info, d) {
  if (!p.ok) {
    return [alertBox('attention', 'alert', p.error === 'report_future' ? 'Cette heure est dans le futur' : 'Date à compléter',
      h('p', {}, p.error === 'report_future'
        ? 'Vérifie la date et l\'heure du rapport pour calculer les délais.'
        : 'Indique la date du rapport pour calculer les délais.'))]
  }
  const out = []

  out.push(h('p', { class: 'v-urg__elapsed' },
    icon('clock', { size: 18 }),
    h('span', {}, `Depuis ce rapport : ${fmtDuration(p.sinceReportMs)}`
      + (p.hasEarlier ? `. Depuis le premier : ${fmtDuration(p.sinceFirstMs)}.` : '.'))))

  if (p.firstError) {
    out.push(alertBox('attention', 'alert', 'Premier rapport à vérifier',
      h('p', {}, p.firstError === 'first_after_report'
        ? 'Le premier rapport doit avoir eu lieu avant celui-ci. Les délais ci-dessous partent du rapport le plus récent.'
        : 'Indique la date du premier rapport. En attendant, les délais partent du rapport le plus récent.')))
  }

  if (info.late || p.oldRisk) {
    out.push(alertBox('attention', 'test', 'Fais d\'abord un test de grossesse',
      h('p', {}, info.late
        ? 'Tes règles sont en retard : fais un test de grossesse avant la contraception d\'urgence. La pharmacie peut t\'en vendre un sur place.'
        : 'Un rapport non protégé date de plus de 21 jours, sans règles depuis : fais un test de grossesse avant la contraception d\'urgence.')))
  }

  if (info.removalInFuture && info.removal && diffDays(d.date, info.removal) !== null
    && diffDays(d.date, info.removal) >= 0 && diffDays(d.date, info.removal) <= PRE_REMOVAL_WINDOW_DAYS) {
    out.push(alertBox('urgent', 'alert', 'Dis-le à la professionnelle AVANT le retrait',
      h('p', {}, `Ton DIU est encore en place (retrait prévu ${fmtDate(info.removal, 'long')}). Les spermatozoïdes peuvent survivre plusieurs jours : ce rapport compte une fois le DIU retiré.`),
      h('ul', { class: 'v-urg__list v-urg__list--tight' },
        h('li', {}, h('strong', {}, 'Reporter le retrait'), ' jusqu\'à avoir 7 jours sans rapport non protégé : c\'est la première option, souvent 1 ou 2 jours suffisent.'),
        h('li', {}, 'Une pilule d\'urgence, si le rapport date de 5 jours au plus (voir les délais ci-dessous). Au-delà, elle ne le couvre plus : parles-en avant le retrait.'),
        h('li', {}, 'La pose d\'un DIU au cuivre, selon les délais.'))))
  }

  if (info.ecThisCycle) {
    out.push(alertBox('info', 'info', null,
      h('p', {}, `Tu as déjà noté une contraception d'urgence ce cycle-ci (${fmtDate(info.ecThisCycle, 'long')}). Une 2e prise est possible après un nouveau rapport à risque : parles-en au pharmacien.`)))
  }

  for (const [i, o] of p.options.entries()) out.push(optionCard(o, i + 1, p, info))

  if (p.options[0].state === 'depasse') {
    out.push(alertBox('info', 'phone', 'Plus de 120 h depuis le premier rapport ?',
      h('p', {}, 'Une professionnelle peut parfois encore poser un DIU : appelle sans attendre une sage-femme, un médecin ou le centre de santé sexuelle.')))
  }
  if (p.earlierNotCoveredByPills && !p.allPast) {
    out.push(alertBox('info', 'info', null,
      h('p', {}, 'Une pilule ne couvre que les rapports des 120 dernières heures : le premier rapport n\'est plus couvert par une pilule. Le test de grossesse à 21 jours reste important.')))
  }
  return out
}

function optionCard(o, rank, p, info) {
  const text = OPTION_TEXT[o.id]
  const notes = []
  if (o.id === 'levonorgestrel') {
    if (o.state === 'hors_amm') notes.push('Au-delà de 72 h, il est utilisé hors autorisation et perd en efficacité : préfère l\'ulipristal ou le DIU au cuivre.')
    if (o.state === 'depasse') notes.push('Au-delà de 96 h, il est inefficace : ne le prends plus.')
    if (info.recentUpa && o.state !== 'depasse') notes.push('Tu as pris de l\'ulipristal il y a moins de 5 jours : le lévonorgestrel pourrait en réduire l\'efficacité. Demande conseil au pharmacien.')
  }
  if (o.id === 'ulipristal' && o.state !== 'depasse') {
    if (info.hormonalRecent) {
      notes.push(`${info.iudType === 'inconnu' ? 'Ton DIU a été retiré il y a moins de 7 jours. S\'il était hormonal, l\'efficacité' : 'Ton DIU hormonal a été retiré il y a moins de 7 jours : l\'efficacité'} de l'ulipristal est théoriquement réduite par le progestatif encore présent. Le lévonorgestrel ou le DIU au cuivre peuvent être préférés : à discuter avec la ou le pharmacien·ne.`)
    } else if (info.recentLng) {
      notes.push('Tu as pris du lévonorgestrel il y a moins de 7 jours : l\'ulipristal pourrait être moins efficace. Demande conseil au pharmacien.')
    }
  }

  let deadlineText
  if (o.state === 'possible') deadlineText = `Jusqu'à ${fmtDeadline(o.deadline)}`
  else if (o.state === 'hors_amm') deadlineText = `72 h dépassées ; hors autorisation jusqu'à ${fmtDeadline(o.offLabelDeadline)}`
  else deadlineText = `Délai terminé ${fmtDeadline(o.state === 'depasse' && o.offLabelDeadline ? o.offLabelDeadline : o.deadline)}`

  const hours = o.id === 'levonorgestrel' ? LEVONORGESTREL_H : o.id === 'ulipristal' ? ULIPRISTAL_H : COPPER_IUD_H
  const isFirst = p.recommended === o.id

  return h('article', {
    class: ['v-urg__option', `v-urg__option--${STATE_META[o.state].cls}`, isFirst ? 'is-recommended' : null],
    ariaLabel: `${rank}. ${text.title} : ${STATE_META[o.state].label}`,
  },
  h('div', { class: 'spread v-urg__option-head' },
    h('h3', { class: 'v-urg__option-title' }, h('span', { class: 'v-urg__rank mono', ariaHidden: 'true' }, `${rank}`), text.title),
    stateTag(o.state)),
  isFirst ? h('p', { class: 'badge badge--brand v-urg__first-choice' }, icon('sparkle', { size: 16 }), 'À privilégier maintenant') : null,
  h('p', { class: 'v-urg__deadline' },
    h('span', { class: 'v-urg__deadline-main' }, deadlineText),
    o.state !== 'depasse' ? h('span', { class: 'v-urg__remaining mono' }, icon('clock', { size: 16 }), h('span', {}, `encore ${fmtDuration(o.remainingMs)}`)) : null),
  h('p', { class: 'hint' }, `Délai : ${hours} h${o.id === 'levonorgestrel' ? ' (72 à 96 h hors autorisation)' : ''}. ${text.windowNote || ''}`.trim()),
  o.state !== 'depasse' ? h('p', {}, text.lead) : null,
  o.state !== 'depasse' ? h('p', { class: 'hint' }, text.where) : null,
  ...notes.map((n) => h('p', { class: 'v-urg__note' }, icon('info', { size: 16 }), h('span', {}, n))))
}

function afterContent(p, info) {
  const testLine = p.ok && p.testDate
    ? [h('strong', {}, `Test de grossesse le ${fmtDate(p.testDate, 'long')}`), ' (21 jours après le dernier rapport), ou plus tôt si tes règles ont 5 jours de retard. Un test fait avant ne peut pas exclure une grossesse.']
    : [h('strong', {}, 'Test de grossesse 21 jours après le dernier rapport'), ', ou plus tôt si tes règles ont 5 jours de retard.']
  return [
    li('Vomissements ou fortes diarrhées dans les 3 h après la pilule : reprends un comprimé.'),
    li(h('strong', {}, 'Préservatif à chaque rapport jusqu\'à tes prochaines vraies règles'), ' : la pilule retarde souvent l\'ovulation sans l\'empêcher. Un spotting ne suffit pas.'),
    li('Une fois la prise notée, Lune garde tous les jours en « protection nécessaire » jusqu\'à ces règles.'),
    li(...testLine),
    li('Nouveau rapport à risque avant tes règles ? Une 2e prise est possible : parles-en au pharmacien.'),
    info.late ? null : li('Tes prochaines règles peuvent arriver en avance ou en retard de quelques jours.'),
  ].filter(Boolean)
}

function li(...children) {
  return h('li', {}, ...children)
}

function tpeContent(p) {
  const out = [
    h('p', {}, 'Si ton partenaire a un statut VIH inconnu ou positif : traitement post-exposition (TPE) aux urgences de l\'hôpital, ', h('strong', {}, 'au mieux dans les 4 h, au plus tard dans les 48 h'), '.'),
  ]
  if (p.ok) {
    if (p.tpe.state === 'depasse') {
      out.push(h('p', { class: 'v-urg__note' }, icon('info', { size: 16 }), h('span', {}, 'Les 48 h sont passées : le TPE n\'est plus possible, mais un dépistage reste utile.')))
    } else {
      out.push(h('p', { class: 'v-urg__deadline' },
        h('span', { class: 'v-urg__deadline-main' }, p.tpe.state === 'ideal'
          ? `Au mieux avant ${fmtDeadline(p.tpe.best)}`
          : `Au plus tard ${fmtDeadline(p.tpe.latest)}`),
        h('span', { class: 'v-urg__remaining mono' }, icon('clock', { size: 16 }), h('span', {}, `encore ${fmtDuration((p.tpe.state === 'ideal' ? p.tpe.best : p.tpe.latest).getTime() - Date.now())}`))))
    }
  }
  out.push(
    h('p', { class: 'hint' }, 'Sans objet pour un couple exclusif dont les deux partenaires ont été dépistés.'),
    h('p', { class: 'hint' }, 'Dépistage des IST : « Mon test IST » en laboratoire, gratuit et sans ordonnance avant 26 ans ; « VIH Test », sans ordonnance et pris en charge à tout âge. Sida Info Service : 0 800 840 800, 7 jours sur 7.'))
  return out
}

// ---------------------------------------------------------------------------
// Enregistrement dans le suivi

function actionsSection(ctx, d, plan, seg, refreshers, refresh) {
  const today = todayParts().today
  const days = ctx.data?.days || {}

  // Rapport.
  const saveFirstBox = h('input', {
    type: 'checkbox', id: 'urg-save-first', checked: d.saveFirst,
    on: { change: (e) => { d.saveFirst = e.target.checked } },
  })
  const saveFirstText = h('span', {})
  const saveFirstRow = h('label', { class: 'v-urg__check', htmlFor: 'urg-save-first' }, saveFirstBox, saveFirstText)
  const reportStatus = h('p', { class: 'v-urg__saved', role: 'status' })
  const reportError = h('p', { class: 'v-urg__error', role: 'alert' })

  const canSaveFirst = () => {
    const p = plan()
    return p.ok && d.others === 'oui' && !p.firstError && p.hasEarlier && d.firstDate !== d.date
      && !RISKY_SEX.has(days[d.firstDate]?.sex)
  }

  refreshers.push(() => {
    const show = canSaveFirst()
    saveFirstRow.hidden = !show
    if (show) saveFirstText.textContent = `Enregistrer aussi le premier rapport (${fmtDate(d.firstDate, 'long')})`
    reportStatus.hidden = !d.reportSaved
    reportStatus.replaceChildren(...(d.reportSaved ? [icon('check', { size: 18 }), h('span', {}, `Rapport enregistré dans ton suivi (${fmtDate(d.reportSaved, 'long')}).`)] : []))
  })
  reportError.hidden = true

  function saveReport() {
    const p = plan()
    if (!p.ok) {
      reportError.textContent = p.error === 'report_future' ? 'La date du rapport est dans le futur.' : 'Indique la date du rapport.'
      reportError.hidden = false
      return
    }
    reportError.hidden = true
    if (canSaveFirst() && d.saveFirst) {
      ctx.actions.saveDay(d.firstDate, reportEntry(days[d.firstDate], 'non_protege', d.firstTime, d.firstTimeUnknown))
    }
    const entry = reportEntry((ctx.data?.days || {})[d.date], d.sexKind, d.time, d.timeUnknown)
    d.reportSaved = d.date
    ctx.actions.saveDay(d.date, entry)
    ctx.ui?.toast?.('Rapport enregistré. Lune te rappellera le test de grossesse. Si tu prends une contraception d\'urgence, note-la ci-dessous : c\'est elle qui garde ton cycle en « protection nécessaire » jusqu\'aux prochaines règles.')
  }

  // Contraception d'urgence prise.
  const ecForm = h('div', { class: 'stack v-urg__ec', id: 'urg-ec-form' },
    h('div', { class: 'field' },
      h('span', { class: 'label', id: 'urg-ec-type-label' }, 'Laquelle ?'),
      seg('urg-ec-type-label', EMERGENCY_CONTRACEPTIONS.map((o) => ({ id: o.id, label: EC_LABELS[o.id] || o.label })),
        () => d.ecType, (v) => { d.ecType = v; d.ecSaved = null }, 'v-urg__seg-col')),
    h('div', { class: 'v-urg__pair' },
      h('div', { class: 'field' },
        h('label', { class: 'label', htmlFor: 'urg-ec-date' }, 'Date de la prise'),
        h('input', {
          type: 'date', id: 'urg-ec-date', class: 'input mono', max: today, value: d.ecDate,
          on: { input: (e) => { d.ecDate = e.target.value; d.ecSaved = null } },
        })),
      h('div', { class: 'field' },
        h('label', { class: 'label', htmlFor: 'urg-ec-time' }, 'Heure'),
        h('input', {
          type: 'time', id: 'urg-ec-time', class: 'input mono', value: d.ecTime,
          on: { input: (e) => { d.ecTime = e.target.value; d.ecSaved = null } },
        }))))
  const ecError = h('p', { class: 'v-urg__error', role: 'alert' })
  const ecStatus = h('p', { class: 'v-urg__saved', role: 'status' })
  ecError.hidden = true
  const ecToggle = h('button', {
    type: 'button',
    class: 'btn btn--block',
    ariaExpanded: 'false',
    ariaControls: 'urg-ec-form',
    on: { click: () => { d.ecOpen = !d.ecOpen; refresh() } },
  }, icon('pill', { size: 18 }), 'J\'ai pris une contraception d\'urgence')
  const ecSave = h('button', {
    type: 'button',
    class: 'btn btn--primary btn--block',
    on: { click: saveEc },
  }, icon('check', { size: 18 }), 'Enregistrer la prise')
  ecForm.append(ecError, ecSave)

  refreshers.push(() => {
    ecForm.hidden = !d.ecOpen
    ecToggle.setAttribute('aria-expanded', String(d.ecOpen))
    ecStatus.hidden = !d.ecSaved
    ecStatus.replaceChildren(...(d.ecSaved ? [icon('check', { size: 18 }), h('span', {}, `${EC_LABELS[d.ecSaved.type]} enregistré le ${fmtDate(d.ecSaved.date, 'long')}. Préservatif à chaque rapport jusqu'à tes prochaines vraies règles.`)] : []))
  })

  function saveEc() {
    const at = localDateTime(d.ecDate, TIME_RE.test(d.ecTime) ? d.ecTime : null)
    let error = null
    if (!d.ecType) error = 'Choisis la contraception d\'urgence prise.'
    else if (!at) error = 'Indique la date de la prise.'
    else if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) error = 'La date de la prise est dans le futur.'
    if (error) {
      ecError.textContent = error
      ecError.hidden = false
      return
    }
    ecError.hidden = true
    const prev = (ctx.data?.days || {})[d.ecDate] || {}
    const entry = { ...prev, emergencyContraception: d.ecType }
    if (TIME_RE.test(d.ecTime)) entry.emergencyContraceptionTime = d.ecTime
    else delete entry.emergencyContraceptionTime
    d.ecSaved = { type: d.ecType, date: d.ecDate }
    d.ecOpen = false
    ctx.actions.saveDay(d.ecDate, entry)
    ctx.ui?.toast?.('Prise enregistrée. Ton cycle reste en « protection nécessaire » jusqu\'aux prochaines règles.')
  }

  return h('section', { class: 'card stack', ariaLabelledby: 'urg-save-title' },
    sectionHead(6, 'Garder une trace dans ton suivi', 'urg-save-title'),
    h('p', { class: 'hint' }, 'Lune s\'en sert pour te rappeler le test de grossesse. Si tu notes une contraception d\'urgence, tout le reste du cycle passe en « protection nécessaire » jusqu\'à tes prochaines vraies règles.'),
    ctx.env?.isDemo ? h('p', { class: 'hint' }, icon('info', { size: 16 }), ' Mode démo : l\'enregistrement modifie seulement les données de démonstration.') : null,
    h('div', { class: 'field' },
      h('span', { class: 'label', id: 'urg-kind-label' }, 'Ce qui s\'est passé'),
      seg('urg-kind-label', [
        { id: 'incident', label: 'Préservatif rompu ou glissé' },
        { id: 'non_protege', label: 'Rapport sans préservatif' },
      ], () => d.sexKind, (v) => { d.sexKind = v; d.reportSaved = null })),
    saveFirstRow,
    reportError,
    h('button', { type: 'button', class: 'btn btn--primary btn--block', on: { click: saveReport } },
      icon('calendar', { size: 18 }), 'Enregistrer ce rapport dans mon suivi'),
    reportStatus,
    h('hr', { class: 'divider' }),
    ecToggle,
    ecForm,
    ecStatus)
}
