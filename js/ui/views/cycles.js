/**
 * Lune — vue « Cycles » : feuille de relevé symptothermique numérique.
 *
 * - Sélecteur de cycle (route `cycles`, params.cycle = index, défaut : cycle en cours).
 * - Courbe SVG à défilement horizontal : températures, 6 valeurs de référence, valeurs hautes
 *   numérotées, ligne auxiliaire, FHM, zone infertile post-ovulatoire, jours manquants,
 *   puis rangées alignées (date, jour, saignements, glaire, sommet, col, LH, rapports, état).
 * - « Comment c'est calculé » : température, signe, double contrôle, début de cycle, drapeaux.
 * - Statistiques (FIGO), graphique des durées, tableau historique.
 *
 * « Ciel de Lune » : courbe indigo / lavande (--temp), ligne auxiliaire bleue, valeurs hautes
 * numérotées dans des pastilles ; les rangées « État » et « Décision » sont PEINTES selon la
 * décision (decisionLook / dayDecision) : un jour infertile selon les règles mais « retenu »
 * (apprentissage, strict, cycle 0…) reste en code « protection » ; l'état n'est que dans le titre (S1).
 * Hachures à bandes de 6 px (S4) ; aucun tireté hors prévisions (S2) ; pas de vert hors « sans protection » (S5).
 *
 * Code contre le contrat (ARCHITECTURE.md §5.2) : tout champ peut manquer ou valoir null.
 */

import {
  h, icon, fmtDate, fmtTemp, fmtTempShort, plural, richText, statusBadge, decisionLook, moonSvg,
  STATE_META, DECISION_META, OVERLAY_META, BLEEDING_LEVELS, MUCUS_SENSATIONS, MUCUS_ASPECTS,
  CERVIX_OPENING, CERVIX_FIRMNESS, TEMP_DISTURBANCES, TEMP_ROUTES, SEX_OPTIONS, LH_RESULTS,
  PREGNANCY_TEST_RESULTS, EMERGENCY_CONTRACEPTIONS, CYCLE_EVENTS, addDays, diffDays,
} from '../dom.js'

/* ------------------------------------------------------------------ */
/* Géométrie de la courbe (px)                                         */
/* ------------------------------------------------------------------ */

const COL = 26              // largeur d'une colonne (un jour de cycle)
const AXIS_W = 60           // colonne fixe des libellés à gauche
const PLOT_TOP = 30         // marge haute (étiquettes FHM / zone infertile)
const PLOT_H = 260          // hauteur de la zone de courbe
const MISS_H = 12           // bande des tirets « jour sans température »
const ROW_H = 24            // hauteur d'une rangée
const DATE_ROW_H = 30       // rangée des dates (mois + jour)
const RIGHT_PAD = 48        // place pour l'étiquette de la ligne auxiliaire
const MIN_COLS = 21         // cycle en cours : feuille d'au moins 3 semaines
const FUTURE_COLS = 3       // cycle en cours : quelques jours à venir, vides
const RANGE_MIN = 3590      // plage verticale minimale : 35,90 – 37,20 °C
const RANGE_MAX = 3720
const DROP_PATH = 'M5 0.5C3.2 3 1 5.6 1 8.2a4 4 0 0 0 8 0C9 5.6 6.8 3 5 0.5z'   // goutte 10 × 13

const MUCUS_CODES = ['t', '∅', 'f', 'S', 'S+']

const TEMP_STATES = {
  confirmee: { label: 'Montée confirmée', icon: 'check', cls: 'brand' },
  en_attente: { label: 'Montée en cours de vérification', icon: 'clock', cls: 'neutral' },
  en_attente_valeurs_basses: { label: 'En attente de 6 valeurs basses', icon: 'clock', cls: 'neutral' },
  aucune_montee: { label: 'Pas de montée détectée', icon: 'minus', cls: 'neutral' },
  non_evaluable: { label: 'Non évaluable', icon: 'x', cls: 'neutral' },
}

const SIGN_STATES = {
  confirme: { label: 'Critère rempli', icon: 'check', cls: 'brand' },
  en_attente: { label: 'En attente des 3 jours après le sommet', icon: 'clock', cls: 'neutral' },
  bloque_donnee_manquante: { label: 'Bloqué : observation manquante', icon: 'alert', cls: 'neutral' },
  aucun_sommet: { label: 'Pas de sommet', icon: 'minus', cls: 'neutral' },
}

const RULE_LABELS = {
  reguliere: 'Règle régulière : 3 valeurs au-dessus de la ligne, la 3e à au moins +0,20 °C.',
  exception1: '1re exception : la 3e valeur n\'atteint pas +0,20 °C ; une 4e valeur au-dessus de la ligne confirme.',
  exception2: '2e exception : une seule des 2e et 3e valeurs retombe sur ou sous la ligne (ignorée) ; la 4e mesure doit être au moins 0,20 °C au-dessus de la ligne.',
}

const PRE_RULE_LABELS = {
  cinq_jours: 'Règle des 5 jours',
  moins_8: 'Règle du moins 8 (FHM la plus précoce − 8)',
}

const SEX_SHORT = { protege: 'protégé', non_protege: 'non protégé', incident: 'incident de préservatif' }

let uid = 0

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** Arrondi au 0,05 °C le plus proche, sur des entiers (spec §2.2.2), pour placer les points. */
function round05(c) {
  const r = c % 5
  return r >= 3 ? c - r + 5 : c - r
}

const isTemp = (v) => Number.isInteger(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const labelOf = (list, id) => list.find((o) => o.id === id)?.label ?? id
const dayOfMonth = (iso) => Number(iso.slice(8, 10))
const monthShort = (iso) => fmtDate(iso, 'court').split(/\s/).pop()
const courtJ = (iso, cycle) => {
  const n = cycle ? diffDays(cycle.start, iso) + 1 : null
  return n ? `${fmtDate(iso, 'court')} (J${n})` : fmtDate(iso, 'court')
}

/** Code Sensiplan de la glaire saisie ce jour (max des champs renseignés), « ? » si douteuse. */
function mucusCode(entry) {
  if (entry.mucusDoubtful) return '?'
  const values = [
    MUCUS_SENSATIONS.find((o) => o.id === entry.mucusSensation)?.value,
    MUCUS_ASPECTS.find((o) => o.id === entry.mucusAspect)?.value,
  ].filter(Number.isInteger)
  return values.length ? MUCUS_CODES[Math.max(...values)] : null
}

function textBlock(str, cls = '') {
  if (!str) return null
  return String(str).split(/\n+/).filter(Boolean).map((p) => h('p', { class: cls }, richText(p)))
}

/** Badge d'évaluation ; cls 'neutral' = badge neutre (une évaluation en attente n'est pas une décision). */
function stateBadge(meta) {
  return h('span', { class: ['badge', `badge--${meta.cls}`] }, icon(meta.icon, { size: 16 }), h('span', {}, meta.label))
}

/** Liste de faits (dl) ; les entrées dont la valeur est vide sont omises. */
function facts(items) {
  const rows = items.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
  if (!rows.length) return null
  return h('dl', { class: 'v-cycles__facts' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))
}

function alertBox(tone, iconName, title, text) {
  return h('div', { class: ['alert', `alert--${tone}`] }, icon(iconName, { size: 20 }),
    h('div', {}, title ? h('p', { class: 'alert__title' }, title) : null, text ? h('p', {}, richText(text)) : null))
}

/** Libellé long d'un cycle. */
function cycleTitle(c, cycles, data) {
  if (c.isCycle0) {
    return c.postRemovalNumber === 0 || data?.profile?.iudRemovalDate
      ? 'Avant tes premières règles après le retrait'
      : 'Avant tes premières règles notées'
  }
  if (Number.isInteger(c.postRemovalNumber)) return `Cycle ${c.postRemovalNumber} après le retrait`
  const removal = data?.profile?.iudRemovalDate
  if (removal && c.start < removal) return 'Cycle avant le retrait'
  return `Cycle ${cycleNumber(c, cycles)}`
}

/** Numéro court d'un cycle (tableau, barres). */
function cycleShort(c, cycles, data) {
  if (!c) return '—'
  if (Number.isInteger(c.postRemovalNumber)) return String(c.postRemovalNumber)
  if (c.isCycle0) return '0'
  const removal = data?.profile?.iudRemovalDate
  if (removal && c.start < removal) return 'avant'
  return String(cycleNumber(c, cycles))
}

function cycleNumber(c, cycles) {
  return c.index + (cycles[0]?.isCycle0 ? 0 : 1)
}

function cycleRange(c) {
  const start = fmtDate(c.start, 'court')
  if (c.end) return `${start} → ${fmtDate(c.end, 'court')} (${c.length ?? c.dayCount} j)`
  if (c.isCycle0) return `depuis le ${start} (${c.dayCount} ${plural(c.dayCount, 'jour')})`
  return `${start} → aujourd'hui (J${c.dayCount})`
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

/**
 * Affiche la vue « Cycles ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 * @returns {void}
 */
export function render(root, ctx) {
  const analysis = ctx.analysis
  const cycles = arr(analysis?.cycles)
  const today = ctx.now?.today ?? analysis?.now?.today
  const wrap = h('div', { class: 'v-cycles stack stack--lg' })
  root.append(wrap)

  if (!cycles.length) {
    renderEmpty(wrap, ctx, today)
    return
  }

  const asked = ctx.route?.params?.cycle
  const index = Number.isInteger(asked) && asked >= 0 && asked < cycles.length ? asked : cycles.length - 1
  const cycle = cycles[index]
  const chart = cycleChart(cycle, ctx, today)

  wrap.append(
    h('header', { class: 'stack stack--sm' },
      h('h1', {}, 'Cycles'),
      h('p', { class: 'muted' }, 'Ta feuille de relevé : température, glaire, état et décision (protection ou non) de chaque jour. Touche une colonne pour voir le détail.')),
    cycleSelector(cycles, index, ctx),
    h('section', { class: 'card v-cycles__chartcard stack', ariaLabelledby: 'v-cycles-chart-title' },
      h('div', { class: 'spread' },
        h('h2', { class: 'section-title', id: 'v-cycles-chart-title' }, 'Courbe'),
        h('span', { class: 'v-cycles__hint muted' }, icon('chevron-left', { size: 16 }), 'défile', icon('chevron-right', { size: 16 }))),
      chart.node,
      legend(ctx)),
    explainSection(cycle, ctx),
    statsSection(analysis, cycles, index, ctx),
    readMore(ctx),
  )

  // Cycle en cours : on amène aujourd'hui à l'écran (à droite).
  if (chart.focusX !== null && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      try {
        const sc = chart.scroller
        sc.scrollLeft = Math.max(0, chart.focusX - sc.clientWidth + COL * 4)
      } catch { /* défilement best effort */ }
    })
  }
}

/* ------------------------------------------------------------------ */
/* Sélecteur de cycle                                                  */
/* ------------------------------------------------------------------ */

/** Longueur de cycle pour la lune du sélecteur : la sienne si terminé, sinon la moyenne, sinon 28. */
function moonLengthOf(c, analysis) {
  if (Number.isInteger(c.length) && c.length >= 2) return c.length
  const mean = Math.round(Number(analysis?.stats?.cycleLength?.mean))
  return Number.isFinite(mean) && mean >= 15 && mean <= 60 ? mean : 28
}

function cycleSelector(cycles, index, ctx) {
  const c = cycles[index]
  const go = (i) => ctx.navigate('cycles', { cycle: i })
  const isCurrent = index === cycles.length - 1
  const moonDay = Number.isInteger(c.dayCount) && c.dayCount > 0 ? c.dayCount : 1
  return h('nav', { class: 'v-cycles__selector', ariaLabel: 'Choisir un cycle' },
    h('button', {
      type: 'button', class: 'iconbtn', ariaLabel: 'Cycle précédent', disabled: index === 0,
      on: { click: () => go(index - 1) },
    }, icon('chevron-left', { size: 24 })),
    h('div', { class: 'v-cycles__selector-body' },
      // Mini-ciel décoratif : la lune du dernier jour affiché (aujourd'hui pour le cycle en cours).
      h('span', { class: 'v-cycles__sky sky', ariaHidden: 'true' }, moonSvg(moonDay, moonLengthOf(c, ctx.analysis), { size: 44, label: null })),
      h('div', { class: 'v-cycles__selector-text' },
        h('p', { class: 'v-cycles__selector-title' }, cycleTitle(c, cycles, ctx.data)),
        h('p', { class: 'v-cycles__selector-range mono' }, cycleRange(c)),
        isCurrent ? h('span', { class: 'badge badge--brand' }, icon('clock', { size: 16 }), h('span', {}, 'En cours')) : null)),
    h('button', {
      type: 'button', class: 'iconbtn', ariaLabel: 'Cycle suivant', disabled: isCurrent,
      on: { click: () => go(index + 1) },
    }, icon('chevron-right', { size: 24 })))
}

/* ------------------------------------------------------------------ */
/* Courbe                                                              */
/* ------------------------------------------------------------------ */

/** Jours affichés : du J1 à la fin (ou à aujourd'hui + quelques jours vides pour le cycle en cours). */
function chartDays(c, today) {
  const last = c.end ?? today ?? c.start
  const n = Math.max(1, (diffDays(c.start, last) ?? 0) + 1)
  const total = c.end ? n : Math.max(n + FUTURE_COLS, MIN_COLS)
  return Array.from({ length: total }, (_, i) => addDays(c.start, i))
}

function tempRange(points) {
  const vals = points.filter((p) => !p.excluded).map((p) => p.r)
  let lo = RANGE_MIN
  let hi = RANGE_MAX
  if (vals.length) {
    lo = Math.min(lo, Math.floor((Math.min(...vals) - 10) / 10) * 10)
    hi = Math.max(hi, Math.ceil((Math.max(...vals) + 10) / 10) * 10)
  }
  return { lo, hi }
}

/** Rangées sous la courbe, selon les réglages. */
function rowsFor(cycle, ctx) {
  const kind = cycle.sign?.kind ?? ctx.data?.profile?.secondarySign ?? 'glaire'
  const rows = [
    { id: 'date', label: 'Date', h: DATE_ROW_H },
    { id: 'day', label: 'Jour', h: ROW_H },
    { id: 'bleeding', label: 'Saign.', h: ROW_H },
    { id: 'mucus', label: 'Glaire', h: ROW_H },
    { id: 'peak', label: kind === 'col' ? 'Éval. col' : 'Sommet', h: ROW_H },
  ]
  if (kind === 'col') rows.push({ id: 'cervix', label: 'Col', h: ROW_H })
  rows.push({ id: 'lh', label: 'LH', h: ROW_H })
  if (ctx.data?.settings?.showSexLog !== false) rows.push({ id: 'sex', label: 'Rapports', h: ROW_H })
  rows.push({ id: 'state', label: 'État', h: ROW_H })
  rows.push({ id: 'decision', label: 'Décision', h: ROW_H })
  let y = PLOT_TOP + PLOT_H + MISS_H
  for (const r of rows) {
    r.y = y
    y += r.h
  }
  return { rows, height: y + 4 }
}

/**
 * Construit la courbe (colonne d'axe fixe + zone défilante).
 * @returns {{ node: HTMLElement, scroller: HTMLElement, focusX: number|null }}
 */
function cycleChart(cycle, ctx, today) {
  const id = `cy${++uid}`
  const days = chartDays(cycle, today)
  const entries = ctx.data?.days || {}
  const statuses = ctx.analysis?.days || {}
  const temp = cycle.temp || {}
  const sign = cycle.sign || {}
  const col = new Map(days.map((iso, i) => [iso, i]))
  const cx = (i) => i * COL + COL / 2
  const isPast = (iso) => !today || iso <= today
  const lastShown = cycle.end ?? today ?? days[days.length - 1]

  const excluded = new Set(arr(temp.excludedDays))
  const refused = new Set(arr(temp.refusedExclusions))
  const ignored = new Set(arr(temp.ignoredDays))
  const reference = new Set(arr(temp.referenceDays))
  const highN = new Map(arr(temp.highDays).map((iso, i) => [iso, i + 1]))

  const points = []
  days.forEach((iso, i) => {
    const e = entries[iso]
    if (!e || !isTemp(e.temp) || !isPast(iso)) return
    points.push({
      iso, i, raw: e.temp, r: round05(e.temp),
      excluded: excluded.has(iso) || (e.tempExcluded === true && !refused.has(iso)),
      refused: refused.has(iso), ignored: ignored.has(iso),
      reference: reference.has(iso), high: highN.get(iso) ?? null,
    })
  })
  const { lo, hi } = tempRange(points)
  const clamp = (r) => Math.min(hi, Math.max(lo, r))
  const y = (r) => PLOT_TOP + ((hi - clamp(r)) * PLOT_H) / (hi - lo)
  const { rows, height } = rowsFor(cycle, ctx)
  const width = days.length * COL + RIGHT_PAD
  const plotBottom = PLOT_TOP + PLOT_H
  const todayIdx = today && col.has(today) ? col.get(today) : null

  const g = []   // éléments SVG, dans l'ordre de peinture

  // Fonds : jours à venir, zone infertile, aujourd'hui.
  days.forEach((iso, i) => {
    if (!isPast(iso)) g.push(h('rect', { class: 'cy-future', x: i * COL, y: PLOT_TOP, width: COL, height: height - PLOT_TOP }))
  })
  const zone = infertileZone(cycle, col, days, lastShown)
  const zoneMeta = zone ? ZONE_META[zoneKind(cycle, statuses)] : null
  if (zone && zoneMeta.hatched) {
    g.push(h('rect', { class: 'cy-zone cy-zone--learn', x: zone.x1, y: PLOT_TOP, width: zone.x2 - zone.x1, height: PLOT_H }))
    g.push(h('rect', { class: 'cy-zone-hatch', fill: `url(#${id}-hatch-learn)`, x: zone.x1, y: PLOT_TOP, width: zone.x2 - zone.x1, height: PLOT_H }))
  } else if (zone) {
    g.push(h('rect', { class: 'cy-zone', x: zone.x1, y: PLOT_TOP, width: zone.x2 - zone.x1, height: PLOT_H }))
  }
  if (todayIdx !== null) {
    g.push(h('rect', { class: 'cy-today', x: todayIdx * COL, y: 0, width: COL, height }))
  }
  if (zone) {
    const atEnd = zone.x1 + zoneMeta.labelWidth > width
    g.push(h('text', {
      class: ['cy-zone-label', zoneMeta.hatched && 'cy-zone-label--learn'],
      x: atEnd ? width - 4 : zone.x1 + 4, y: 14, textAnchor: atEnd ? 'end' : 'start',
    }, zoneMeta.label))
  }

  // Quadrillage.
  const step = PLOT_H / (hi - lo)
  for (let v = lo; v <= hi; v += 5) {
    const strong = v % 10 === 0
    if (!strong && step * 5 < 5) continue
    g.push(h('line', { class: ['cy-grid', strong && 'cy-grid--strong'], x1: 0, x2: days.length * COL, y1: y(v), y2: y(v) }))
  }
  for (let i = 0; i <= days.length; i++) {
    g.push(h('line', { class: 'cy-grid', x1: i * COL, x2: i * COL, y1: PLOT_TOP, y2: height - 4 }))
  }
  for (const r of rows) {
    g.push(h('line', { class: 'cy-rowline', x1: 0, x2: days.length * COL, y1: r.y, y2: r.y }))
  }

  // FHM.
  if (temp.fhm && col.has(temp.fhm)) {
    const x = cx(col.get(temp.fhm))
    g.push(h('line', { class: 'cy-fhm', x1: x, x2: x, y1: PLOT_TOP - 6, y2: plotBottom }))
    g.push(h('text', { class: 'cy-fhm-label', x, y: PLOT_TOP - 10, textAnchor: 'middle' }, 'FHM'))
  }

  // Ligne auxiliaire, des valeurs de référence jusqu'à la confirmation.
  if (isTemp(temp.coverline)) {
    const refIdx = arr(temp.referenceDays).map((iso) => col.get(iso)).filter((i) => i !== undefined)
    const startIdx = refIdx.length ? Math.min(...refIdx) : 0
    const lastData = points.length ? points[points.length - 1].i : startIdx
    const endIdx = temp.confirmDay && col.has(temp.confirmDay) ? col.get(temp.confirmDay) : lastData
    const yl = y(temp.coverline)
    const x2 = (Math.max(endIdx, startIdx) + 1) * COL
    g.push(h('line', { class: 'cy-coverline', x1: startIdx * COL, x2, y1: yl, y2: yl }))
    g.push(h('text', { class: 'cy-coverline-label', x: x2 + 4, y: yl + 4 }, fmtTempShort(temp.coverline)))
  }

  // Segments de courbe : interrompus sur jour manquant ou valeur exclue.
  let seg = []
  const flush = () => {
    if (seg.length > 1) {
      const pts = seg.map((p) => `${cx(p.i)},${y(p.r)}`)
      const x0 = cx(seg[0].i)
      const x1 = cx(seg[seg.length - 1].i)
      g.push(h('polygon', { class: 'cy-area', fill: `url(#${id}-area)`, points: [`${x0},${plotBottom}`, ...pts, `${x1},${plotBottom}`].join(' ') }))
      g.push(h('polyline', { class: 'cy-line', points: pts.join(' ') }))
    }
    seg = []
  }
  for (const p of points) {
    if (p.excluded) { flush(); continue }
    if (seg.length && seg[seg.length - 1].i !== p.i - 1) flush()
    seg.push(p)
  }
  flush()

  // Points et marques.
  for (const p of points) g.push(tempPoint(p, cx(p.i), y(p.r), p.r !== clamp(p.r), cycle))

  // Jours sans température (passés).
  days.forEach((iso, i) => {
    if (!isPast(iso)) return
    const e = entries[iso] || {}
    const st = statuses[iso]
    const missing = st?.markers ? st.markers.missingTemp === true : !isTemp(e.temp) && !e.tempExcluded
    if (missing) {
      g.push(h('line', { class: 'cy-missing', x1: cx(i) - 5, x2: cx(i) + 5, y1: plotBottom + 6, y2: plotBottom + 6 },
        h('svg:title', {}, `${fmtDate(iso, 'court')} : pas de température`)))
    }
  })

  // Rangées.
  days.forEach((iso, i) => {
    const e = entries[iso] || {}
    const st = statuses[iso] || null
    for (const r of rows) {
      const node = rowCell(r, { iso, i, x: cx(i), e, st, sign, today, past: isPast(iso), id })
      if (node) g.push(node)
    }
  })

  // Zones de toucher (une par jour passé).
  days.forEach((iso, i) => {
    if (!isPast(iso)) return
    const open = () => openDay(ctx, cycle, iso)
    g.push(h('rect', {
      class: 'cy-hit', x: i * COL, y: 0, width: COL, height,
      role: 'button',
      ariaLabel: dayAria(iso, i, entries[iso], statuses[iso]),
      attrs: { tabindex: 0 },
      on: {
        click: open,
        keydown: (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open() }
        },
      },
    }))
  })

  const svg = h('svg', {
    class: 'cy-chart', width, height, viewBox: `0 0 ${width} ${height}`,
    role: 'group', ariaLabel: `Courbe du cycle, ${days.length} jours`,
  }, chartDefs(id), g)

  const axis = axisSvg(rows, height, lo, hi, y)
  const scroller = h('div', { class: 'v-cycles__scroll', tabIndex: 0, ariaLabel: 'Courbe, défilement horizontal' }, svg)
  const node = h('div', { class: 'v-cycles__chart' }, axis, scroller)
  const focusX = !cycle.end && todayIdx !== null ? (todayIdx + 1) * COL : null
  return { node, scroller, focusX }
}

/**
 * Ce qui empêche la décision « pas de protection » malgré un double contrôle confirmé
 * (mêmes causes que la carte « Double contrôle », plus le blocage du jour de bascule, K1).
 * @param {object} cycle
 * @param {object} [statuses] analysis.days
 * @returns {{ need: string[], learn: string[] }}
 *   need : protection nécessaire (cycle 0, contraception d'urgence, non évaluable, LH douteuse, autre blocage) ;
 *   learn : protection recommandée (apprentissage, mode strict)
 */
export function zoneBlockers(cycle, statuses = {}) {
  const f = cycle?.flags || {}
  const need = [
    cycle?.isCycle0 && 'cycle 0',
    f.emergencyContraception && 'contraception d\'urgence',
    f.unevaluable && 'cycle non évaluable',
    cycle?.temp?.lhDoubt && 'évaluation douteuse (LH)',
  ].filter(Boolean)
  const learn = [
    f.learning && 'cycle d\'apprentissage',
    f.strictFSRH && 'mode strict FSRH',
  ].filter(Boolean)
  const from = cycle?.double?.infertileFrom
  const sw = from ? statuses?.[from]?.eveningSwitch : null
  if (sw && sw.blocked === true && !need.length && !learn.length) need.push('protection maintenue ce cycle')
  return { need, learn }
}

const ZONE_META = {
  plain: { label: 'Infertile (double contrôle)', hatched: false, labelWidth: 170 },
  need: { label: 'Évaluation pour apprendre : protection nécessaire', hatched: true, labelWidth: 300 },
  learn: { label: 'Infertile selon les règles : protection recommandée (apprentissage)', hatched: true, labelWidth: 400 },
}

/**
 * Type de zone post-ovulatoire à tracer : pleine seulement si rien ne maintient la protection.
 * @returns {'plain'|'need'|'learn'}
 */
export function zoneKind(cycle, statuses = {}) {
  const { need, learn } = zoneBlockers(cycle, statuses)
  if (need.length) return 'need'
  if (learn.length) return 'learn'
  return 'plain'
}

/** Zone post-ovulatoire infertile : du soir de double.infertileFrom (≈ ¾ de colonne) à la fin. */
function infertileZone(cycle, col, days, lastShown) {
  const from = cycle.double?.infertileFrom
  if (!from || cycle.double?.state !== 'confirme') return null
  let startIdx = col.get(from)
  if (startIdx === undefined) {
    if (from < days[0]) startIdx = 0
    else return null
  }
  const endIso = days.filter((iso) => iso <= lastShown).pop()
  const endIdx = endIso ? col.get(endIso) : startIdx
  if (endIdx < startIdx) return null
  const offset = from >= days[0] && col.has(from) ? COL * 0.75 : 0
  return { x1: startIdx * COL + offset, x2: (endIdx + 1) * COL }
}

/** Hachures à bandes de 6 px (S4) : 'soft' sur --protect-soft, 'strong' sur --protect, 'learn' (zone). */
function hatchPattern(pid, kind) {
  return h('pattern', {
    id: pid, width: 12, height: 12, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  }, h('line', { class: `cy-hatch cy-hatch--${kind}`, x1: 3, y1: 0, x2: 3, y2: 12 }))
}

function chartDefs(id) {
  return h('defs', {},
    hatchPattern(`${id}-hatch-soft`, 'soft'),
    hatchPattern(`${id}-hatch-strong`, 'strong'),
    hatchPattern(`${id}-hatch-learn`, 'learn'),
    h('linearGradient', { id: `${id}-area`, x1: 0, y1: 0, x2: 0, y2: 1 },
      h('stop', { class: 'cy-area-stop', offset: '0' }),
      h('stop', { class: 'cy-area-stop cy-area-stop--end', offset: '1' })))
}

function tempPoint(p, x, yy, clamped, cycle) {
  const parts = []
  const desc = [`${fmtDate(p.iso, 'court')} : ${fmtTemp(p.raw)}`]
  if (p.r !== p.raw) desc.push(`arrondie à ${fmtTempShort(p.r)}`)
  if (p.excluded) {
    desc.push('valeur exclue')
    if (clamped) {
      const up = yy <= PLOT_TOP + 1
      parts.push(h('path', {
        class: 'cy-pt--excluded',
        d: up ? `M${x - 4} ${yy + 5} L${x} ${yy - 1} L${x + 4} ${yy + 5} Z` : `M${x - 4} ${yy - 5} L${x} ${yy + 1} L${x + 4} ${yy - 5} Z`,
      }))
    } else {
      parts.push(h('circle', { class: 'cy-pt--excluded', cx: x, cy: yy, r: 4.2 }))
      parts.push(h('line', { class: 'cy-pt-slash', x1: x - 3, y1: yy + 3, x2: x + 3, y2: yy - 3 }))
    }
  } else {
    if (p.refused) {
      desc.push('exclusion refusée : la valeur compte')
      parts.push(h('circle', { class: 'cy-ring--refused', cx: x, cy: yy, r: 7 }))
    }
    if (p.ignored) desc.push('valeur ignorée (2e exception)')
    parts.push(h('circle', { class: ['cy-pt', p.ignored && 'cy-pt--ignored'], cx: x, cy: yy, r: p.ignored ? 4 : 3.6 }))
    if (p.reference) {
      desc.push('valeur de référence')
      parts.push(h('line', { class: 'cy-ref', x1: x - 6, x2: x + 6, y1: yy + 7, y2: yy + 7 }))
    }
    if (p.high) {
      desc.push(`valeur haute n° ${p.high}`)
      parts.push(h('circle', { class: 'cy-highpill', cx: x, cy: yy - 14, r: 7.5 }))
      parts.push(h('text', { class: 'cy-highnum', x, y: yy - 10.5, textAnchor: 'middle' }, String(p.high)))
    }
  }
  if (cycle.temp?.fhm === p.iso) desc.push('1re valeur haute (FHM)')
  return h('g', { class: 'cy-point' }, h('svg:title', {}, desc.join(' · ')), parts)
}

/** Contenu d'une cellule de rangée (null si vide). */
function rowCell(row, c) {
  const { iso, i, x, e, st, sign, today, past, id } = c
  const mid = row.y + row.h / 2
  const text = (str, cls, title) => h('text', { class: cls, x, y: mid + 4, textAnchor: 'middle' },
    title ? h('svg:title', {}, title) : null, str)
  switch (row.id) {
    case 'date': {
      const first = i === 0 || dayOfMonth(iso) === 1
      return h('g', {},
        first ? h('text', { class: 'cy-month', x: i * COL + 2, y: row.y + 10 }, monthShort(iso)) : null,
        h('text', { class: ['cy-date', iso === today && 'cy-date--today'], x, y: row.y + 24, textAnchor: 'middle' }, String(dayOfMonth(iso))))
    }
    case 'day': {
      const n = st?.cycleDay ?? i + 1
      return text(String(n), ['cy-daynum', n % 5 === 0 && 'cy-daynum--five'])
    }
    case 'bleeding':
      return e.bleeding ? bleedingMark(e.bleeding, x, mid, e.cycleStart === true) : null
    case 'mucus': {
      if (!past) return null
      const code = mucusCode(e)
      if (code) return text(code, ['cy-code', (code === 'S+' || code === 'S') && 'cy-code--strong'], labelOfMucus(e))
      if (st?.markers?.missingSign) return text('–', 'cy-code cy-code--missing', 'Signe non noté')
      return null
    }
    case 'peak': {
      if (!sign.peakDay) return null
      const off = diffDays(sign.peakDay, iso)
      if (off === 0) {
        const provisional = sign.state !== 'confirme'
        return h('g', {},
          h('svg:title', {}, provisional ? 'Sommet (P), pas encore confirmé' : 'Sommet (P)'),
          h('rect', { class: ['cy-peakbox', provisional && 'cy-peakbox--provisional'], x: x - 9, y: mid - 9, width: 18, height: 18, rx: 4 }),
          h('text', { class: 'cy-peak', x, y: mid + 4, textAnchor: 'middle' }, 'P'))
      }
      if (off >= 1 && off <= 3) return text(String(off), 'cy-peakplus', `P+${off}`)
      return null
    }
    case 'cervix':
      return e.cervixOpening || e.cervixFirmness ? cervixMark(e, x, mid) : null
    case 'lh':
      if (e.lh === 'positif') return text('+', 'cy-lh cy-lh--pos', 'Test LH positif')
      if (e.lh === 'negatif') return text('−', 'cy-lh', 'Test LH négatif')
      return null
    case 'sex':
      return e.sex ? sexMark(e.sex, x, mid) : null
    case 'state':
      return st ? stateCell(st, i, row, id) : null
    case 'decision':
      return st && past ? decisionCell(st, i, row, id) : null
    default:
      return null
  }
}

function labelOfMucus(e) {
  if (e.mucusDoubtful) return 'Observation douteuse'
  return [e.mucusSensation && labelOf(MUCUS_SENSATIONS, e.mucusSensation), e.mucusAspect && labelOf(MUCUS_ASPECTS, e.mucusAspect)]
    .filter(Boolean).join(' · ')
}

function bleedingMark(level, x, mid, isStart) {
  const title = h('svg:title', {}, labelOf(BLEEDING_LEVELS, level) + (isStart ? ' · 1er jour des règles' : ''))
  if (level === 'spotting') return h('g', {}, title, h('circle', { class: 'cy-spot', cx: x, cy: mid, r: 2.4 }))
  const n = { leger: 1, moyen: 2, abondant: 3 }[level] ?? 1
  const s = n === 1 ? 1 : n === 2 ? 0.85 : 0.7
  const w = 10 * s
  const total = n * w + (n - 1)
  const drops = Array.from({ length: n }, (_, k) => h('path', {
    class: level === 'post_retrait' ? 'cy-drop cy-drop--hollow' : 'cy-drop',
    d: DROP_PATH,
    transform: `translate(${x - total / 2 + k * (w + 1)} ${mid - (13 * s) / 2}) scale(${s})`,
  }))
  return h('g', {}, title, drops)
}

function cervixMark(e, x, mid) {
  const title = h('svg:title', {}, [e.cervixOpening && labelOf(CERVIX_OPENING, e.cervixOpening), e.cervixFirmness && labelOf(CERVIX_FIRMNESS, e.cervixFirmness)].filter(Boolean).join(' · '))
  const changed = !(e.cervixOpening === 'ferme' && e.cervixFirmness === 'dur')
  const cls = ['cy-cervix', changed && 'cy-cervix--changed']
  const ox = x - 4
  let shape = null
  if (e.cervixOpening === 'ferme') shape = h('circle', { class: [cls, 'cy-cervix--filled'], cx: ox, cy: mid, r: 2.5 })
  else if (e.cervixOpening === 'mi_ouvert') shape = h('circle', { class: cls, cx: ox, cy: mid, r: 3.5 })
  else if (e.cervixOpening === 'ouvert') shape = h('circle', { class: cls, cx: ox, cy: mid, r: 5 })
  const firm = e.cervixFirmness ? h('text', { class: ['cy-code', changed && 'cy-code--strong'], x: x + 6, y: mid + 4, textAnchor: 'middle' }, e.cervixFirmness === 'dur' ? 'd' : 'm') : null
  return h('g', {}, title, shape, firm)
}

function sexMark(kind, x, mid) {
  const title = h('svg:title', {}, `Rapport ${SEX_SHORT[kind] ?? ''}`)
  if (kind === 'incident') {
    return h('g', {}, title, h('path', { class: 'cy-sex cy-sex--incident', d: `M${x} ${mid - 5} L${x + 5} ${mid + 4} L${x - 5} ${mid + 4} Z` }))
  }
  return h('g', {}, title, h('circle', { class: ['cy-sex', kind === 'non_protege' ? 'cy-sex--non' : 'cy-sex--protege'], cx: x, cy: mid, r: 4 }))
}

/**
 * Forme d'une case de rangée (État ou Décision), peinte selon la décision.
 * tone 'soft' (rangée État) : braise pâle hachurée ; tone 'strong' (rangée Décision) : aplat braise hachuré.
 * kind : 'protect' | 'mixed' | 'pre' | 'safe'.
 */
function cellShape(kind, tone, i, row, id) {
  const x = i * COL + 2
  const yy = row.y + 3
  const w = COL - 4
  const hh = row.h - 6
  const hatch = (ww) => h('rect', { class: 'cy-cell-hatch', fill: `url(#${id}-hatch-${tone})`, x, y: yy, width: ww, height: hh })
  if (kind === 'mixed') {
    return [
      h('rect', { class: `cy-cell cy-cell--protect-${tone}`, x, y: yy, width: w * 0.75, height: hh }),
      hatch(w * 0.75),
      h('rect', { class: 'cy-cell cy-cell--safe', x: x + w * 0.75, y: yy, width: w * 0.25, height: hh }),
      h('line', { class: 'cy-cell-split', x1: x + w * 0.75, x2: x + w * 0.75, y1: yy, y2: yy + hh }),
    ]
  }
  if (kind === 'protect') {
    return [h('rect', { class: `cy-cell cy-cell--protect-${tone}`, x, y: yy, width: w, height: hh, rx: 2 }), hatch(w)]
  }
  return [h('rect', { class: `cy-cell cy-cell--${kind}`, x: x + 0.75, y: yy + 0.75, width: w - 1.5, height: hh - 1.5, rx: 6 })]
}

/** Icône centrée d'une case de rangée ; coche cerclée pour « début de cycle » (S2), pastille claire pour « jusqu'à 18 h ». */
function cellIcon(name, kind, tone, i, row) {
  const yy = row.y + 3
  const hh = row.h - 6
  const cx = i * COL + COL / 2
  const cy = yy + hh / 2
  const size = kind === 'pre' ? 10 : 12
  const ico = icon(name, { size })
  ico.setAttribute('x', String(cx - size / 2))
  ico.setAttribute('y', String(cy - size / 2))
  const extra = kind === 'pre'
    ? h('circle', { class: 'cy-cell-ring', cx, cy, r: 6.5 })
    : kind === 'mixed' ? h('circle', { class: 'cy-cell-dot', cx, cy, r: 7 }) : null
  const cls = kind === 'protect' ? `cy-cell-ico--protect-${tone}` : `cy-cell-ico--${kind}`
  return h('g', { class: ['cy-cell-ico', cls] }, extra, ico)
}

function stateCell(st, i, row, id) {
  const meta = STATE_META[st.state] || STATE_META.INDETERMINE
  // S1 : la case est peinte selon la décision ; un jour « retenu » garde le code protection,
  // son état selon les règles n'apparaît que dans le titre.
  const look = decisionLook(st)
  const title = look.held
    ? `${look.aria}${st.stateReason ? ` · ${st.stateReason}` : ''}`
    : `${meta.short}${st.stateReason ? ` : ${st.stateReason}` : ''}`
  const iconName = look.held ? 'shield' : look.kind === 'mixed' ? 'mixed' : meta.icon
  return h('g', { class: ['cy-statecell', `cy-statecell--${look.kind}`, look.held && 'cy-statecell--held'] },
    h('svg:title', {}, title),
    cellShape(look.kind, 'soft', i, row, id),
    cellIcon(iconName, look.kind, 'soft', i, row))
}

/**
 * Décision d'un jour pour la rangée « Décision » (indépendante de l'heure de l'analyse).
 * Jour de bascule non bloqué (K1) : protection jusqu'à 18 h, puis non. Sinon : protectionNeeded,
 * une valeur absente ou inconnue comptant comme « protection nécessaire ».
 * @param {object} st DayStatus
 * @returns {'protection'|'soir'|'libre'}
 */
export function dayDecision(st) {
  if (!st) return 'protection'
  const sw = st.eveningSwitch
  if (sw) return sw.blocked === false ? 'soir' : 'protection'
  return st.protectionNeeded === false ? 'libre' : 'protection'
}

const DECISION_TITLES = {
  protection: DECISION_META.protection.label,
  soir: `${DECISION_META.protection.label} jusqu'à 18 h, puis pas de protection nécessaire selon les règles`,
  libre: DECISION_META.libre.label,
}

function decisionCell(st, i, row, id) {
  const kind = dayDecision(st)
  const look = kind === 'soir' ? 'mixed'
    : kind === 'protection' ? 'protect'
      : st.state === 'INFERTILE_PRE' ? 'pre' : 'safe'
  const iconName = kind === 'soir' ? 'mixed' : DECISION_META[kind].icon
  return h('g', { class: ['cy-decision', `cy-decision--${kind}`] },
    h('svg:title', {}, DECISION_TITLES[kind]),
    cellShape(look, 'strong', i, row, id),
    cellIcon(iconName, look, 'strong', i, row))
}

function axisSvg(rows, height, lo, hi, y) {
  const g = [h('text', { class: 'cy-axis-unit', x: AXIS_W - 6, y: 14, textAnchor: 'end' }, '°C')]
  for (let v = lo; v <= hi; v += 10) {
    g.push(h('text', { class: 'cy-axis-label', x: AXIS_W - 6, y: y(v) + 4, textAnchor: 'end' }, fmtTempShort(v)))
  }
  for (const r of rows) {
    g.push(h('text', { class: 'cy-row-label', x: 4, y: r.y + r.h / 2 + 4 }, r.label))
    g.push(h('line', { class: 'cy-rowline', x1: 0, x2: AXIS_W, y1: r.y, y2: r.y }))
  }
  return h('svg', {
    class: 'v-cycles__axis', width: AXIS_W, height, viewBox: `0 0 ${AXIS_W} ${height}`, ariaHidden: 'true',
  }, g)
}

function dayAria(iso, i, entry, st) {
  const parts = [`${fmtDate(iso, 'long')}, jour ${st?.cycleDay ?? i + 1}`]
  if (entry && isTemp(entry.temp)) parts.push(fmtTemp(entry.temp))
  if (!st) parts.push('pas de statut')
  else {
    const look = decisionLook(st)
    parts.push(look.held ? look.aria : (STATE_META[st.state] || STATE_META.INDETERMINE).short)
  }
  if (st) parts.push(DECISION_TITLES[dayDecision(st)].toLowerCase())
  return `${parts.join(', ')}. Voir le détail.`
}

/* ------------------------------------------------------------------ */
/* Feuille « détail du jour »                                          */
/* ------------------------------------------------------------------ */

function openDay(ctx, cycle, iso) {
  const entry = ctx.data?.days?.[iso] || {}
  const st = ctx.analysis?.days?.[iso] || null
  const n = st?.cycleDay ?? diffDays(cycle.start, iso) + 1
  let close = () => {}
  const edit = h('button', {
    type: 'button', class: 'btn btn--primary btn--block',
    on: { click: () => { close(); ctx.navigate('noter', { date: iso }) } },
  }, icon('edit', { size: 18 }), 'Modifier')
  const content = h('div', { class: 'v-cycles-sheet stack' },
    st ? dayStatusBlock(st) : h('p', { class: 'muted' }, 'Pas de statut calculé pour ce jour.'),
    dayMarkers(st, cycle, iso),
    dayEntryFacts(entry, ctx) || h('p', { class: 'muted' }, 'Rien de noté ce jour-là.'),
    edit)
  close = ctx.ui.openSheet({ title: `${cap(fmtDate(iso, 'long'))} · J${n}`, content })
}

const SHEET_ST = { protect: 'st--protect', pre: 'st--pre', safe: 'st--safe' }

function dayStatusBlock(st) {
  const free = st.protectionNeeded === false
  const decision = DECISION_META[free ? 'libre' : 'protection']
  // Même code que la courbe : protection = braise hachurée + bouclier ; sinon coche (cerclée en début de cycle).
  const kind = !free ? 'protect' : st.state === 'INFERTILE_PRE' ? 'pre' : 'safe'
  const overlays = arr(st.overlays).map((o) => OVERLAY_META[o]).filter(Boolean)
  return h('div', { class: 'stack stack--sm' },
    h('div', { class: ['v-cycles-sheet__decision', `v-cycles-sheet__decision--${kind}`] },
      h('span', { class: ['st', 'st--sm', SHEET_ST[kind]], ariaHidden: 'true' }, icon(decision.icon, { size: 16 })),
      h('div', {},
        h('p', { class: 'v-cycles-sheet__decision-label' }, decision.label),
        st.decisionReason ? h('p', { class: 'v-cycles-sheet__decision-text' }, richText(st.decisionReason)) : null)),
    h('div', { class: 'row' }, statusBadge(st)),
    st.stateReason ? h('p', { class: 'v-cycles-sheet__reason' }, richText(st.stateReason)) : null,
    overlays.length
      ? h('div', { class: 'row' }, overlays.map((m) => h('span', { class: ['badge', `badge--${m.cls}`] }, icon(m.icon, { size: 16 }), h('span', {}, m.label))))
      : null)
}

function dayMarkers(st, cycle, iso) {
  const m = st?.markers || {}
  const temp = cycle.temp || {}
  const list = []
  if (m.reference || arr(temp.referenceDays).includes(iso)) list.push('Valeur de référence (une des 6 valeurs basses)')
  const high = m.high ?? (arr(temp.highDays).indexOf(iso) + 1 || null)
  if (high) list.push(`Valeur haute n° ${high}`)
  if (m.fhm || temp.fhm === iso) list.push('1re valeur haute (FHM)')
  if (m.confirm || temp.confirmDay === iso) list.push('Confirmation de la montée de température')
  if (m.ignored || arr(temp.ignoredDays).includes(iso)) list.push('Valeur ignorée (2e exception)')
  if (m.excluded || arr(temp.excludedDays).includes(iso)) list.push('Valeur exclue du calcul')
  if (arr(temp.refusedExclusions).includes(iso)) list.push('Exclusion refusée : la valeur compte dans le calcul')
  const peakOff = cycle.sign?.peakDay ? diffDays(cycle.sign.peakDay, iso) : null
  if (m.peak || peakOff === 0) list.push('Sommet de glaire (P)')
  const plus = m.peakPlus ?? (peakOff >= 1 && peakOff <= 3 ? peakOff : null)
  if (plus) list.push(`P+${plus}`)
  if (cycle.double?.infertileFrom === iso) list.push('Double contrôle : infertile à partir de 18 h')
  if (m.missingTemp) list.push('Température manquante')
  if (m.missingSign) list.push('Signe (glaire ou col) non noté')
  if (!list.length) return null
  return h('div', { class: 'stack stack--sm' },
    h('h3', { class: 'eyebrow' }, 'Sur la courbe'),
    h('ul', { class: 'v-cycles-sheet__list' }, list.map((t) => h('li', {}, t))))
}

function dayEntryFacts(e, ctx) {
  const tempParts = []
  if (isTemp(e.temp)) {
    tempParts.push(fmtTemp(e.temp))
    if (round05(e.temp) !== e.temp) tempParts.push(`(arrondie à ${fmtTempShort(round05(e.temp))})`)
    if (e.tempTime) tempParts.push(`à ${e.tempTime.replace(':', ' h ')}`)
    if (e.tempRoute) tempParts.push(`· ${labelOf(TEMP_ROUTES, e.tempRoute).toLowerCase()}`)
  } else if (e.tempExcluded) tempParts.push('Pas de valeur (perturbation notée)')
  const disturb = arr(e.tempDisturbances).map((d) => labelOf(TEMP_DISTURBANCES, d))
  const mucus = labelOfMucus(e)
  const code = mucusCode(e)
  const cervix = [e.cervixOpening && labelOf(CERVIX_OPENING, e.cervixOpening), e.cervixFirmness && labelOf(CERVIX_FIRMNESS, e.cervixFirmness)].filter(Boolean).join(' · ')
  const bleeding = e.bleeding ? labelOf(BLEEDING_LEVELS, e.bleeding) + (e.cycleStart ? ' · 1er jour des règles' : '') : null
  const showSex = ctx.data?.settings?.showSexLog !== false
  const sex = showSex && e.sex ? labelOf(SEX_OPTIONS, e.sex) + (e.sexTime ? ` à ${e.sexTime.replace(':', ' h ')}` : '') : null
  const cu = e.emergencyContraception
    ? labelOf(EMERGENCY_CONTRACEPTIONS, e.emergencyContraception) + (e.emergencyContraceptionTime ? ` à ${e.emergencyContraceptionTime.replace(':', ' h ')}` : '')
    : null
  const notes = typeof e.notes === 'string' && e.notes.trim() ? (e.notes.length > 240 ? `${e.notes.slice(0, 240)}…` : e.notes) : null
  return facts([
    ['Température', tempParts.join(' ') || null],
    ['Perturbation', disturb.length ? disturb.join(', ') + (e.tempExcluded ? ' · exclusion demandée' : '') : null],
    ['Glaire', mucus ? `${mucus}${code && code !== '?' ? ` (${code})` : ''}` : null],
    ['Col', cervix || null],
    ['Saignement', bleeding],
    ['Test LH', e.lh ? labelOf(LH_RESULTS, e.lh) : null],
    ['Test de grossesse', e.pregnancyTest ? labelOf(PREGNANCY_TEST_RESULTS, e.pregnancyTest) : null],
    ['Rapport', sex],
    ['Contraception d\'urgence', cu],
    ['Événement', arr(e.events).map((v) => labelOf(CYCLE_EVENTS, v)).join(', ') || null],
    ['Note', notes],
  ])
}

/* ------------------------------------------------------------------ */
/* Légende                                                             */
/* ------------------------------------------------------------------ */

function legend(ctx) {
  const mini = (...children) => h('svg', { class: 'cy-mini', width: 30, height: 18, viewBox: '0 0 30 18', ariaHidden: 'true' }, children)
  const item = (sym, label) => h('li', { class: 'v-cycles__legend-item' }, sym, h('span', {}, label))
  const items = [
    item(mini(h('polyline', { class: 'cy-line', points: '3,12 15,7 27,9' }), h('circle', { class: 'cy-pt', cx: 15, cy: 7, r: 3.6 })), 'Température (valeur arrondie au 0,05)'),
    item(mini(h('circle', { class: 'cy-pt--excluded', cx: 15, cy: 9, r: 4.2 }), h('line', { class: 'cy-pt-slash', x1: 12, y1: 12, x2: 18, y2: 6 })), 'Valeur exclue (ne compte pas)'),
    item(mini(h('circle', { class: 'cy-pt cy-pt--ignored', cx: 15, cy: 9, r: 4 })), 'Valeur ignorée (2e exception)'),
    item(mini(h('circle', { class: 'cy-ring--refused', cx: 15, cy: 9, r: 7 }), h('circle', { class: 'cy-pt', cx: 15, cy: 9, r: 3.6 })), 'Exclusion refusée (la valeur compte)'),
    item(mini(h('circle', { class: 'cy-pt', cx: 15, cy: 6, r: 3.6 }), h('line', { class: 'cy-ref', x1: 9, x2: 21, y1: 13, y2: 13 })), '6 valeurs de référence (soulignées)'),
    item(mini(
      [5, 15, 25].map((x, k) => h('g', {},
        h('circle', { class: 'cy-highpill', cx: x, cy: 9, r: 5 }),
        h('text', { class: 'cy-highnum cy-highnum--mini', x, y: 12, textAnchor: 'middle' }, String(k + 1))))),
    'Valeurs hautes numérotées'),
    item(mini(h('line', { class: 'cy-coverline', x1: 2, x2: 28, y1: 9, y2: 9 })), 'Ligne auxiliaire'),
    item(mini(h('line', { class: 'cy-fhm', x1: 15, x2: 15, y1: 1, y2: 17 })), '1re valeur haute (FHM)'),
    item(mini(h('rect', { class: 'cy-zone', x: 2, y: 2, width: 26, height: 14 })), 'Infertile après double contrôle (à partir de 18 h), sans protection nécessaire selon les règles'),
    item(mini(
      h('defs', {}, hatchPattern('cy-legend-hatch-learn', 'learn')),
      h('rect', { class: 'cy-zone cy-zone--learn', x: 2, y: 2, width: 26, height: 14 }),
      h('rect', { class: 'cy-zone-hatch', fill: 'url(#cy-legend-hatch-learn)', x: 2, y: 2, width: 26, height: 14 })),
    'Double contrôle confirmé, mais protection nécessaire ou recommandée (cycle 0, apprentissage, mode strict, contraception d\'urgence, cycle non évaluable, LH douteuse)'),
    item(mini(h('line', { class: 'cy-missing', x1: 10, x2: 20, y1: 9, y2: 9 })), 'Jour sans température'),
    item(mini(h('rect', { class: 'cy-peakbox', x: 6, y: 1, width: 16, height: 16, rx: 4 }), h('text', { class: 'cy-peak', x: 14, y: 13, textAnchor: 'middle' }, 'P')), 'Sommet de glaire, puis 1, 2, 3'),
    item(mini(h('path', { class: 'cy-drop', d: DROP_PATH, transform: 'translate(10 2.5)' })), 'Règles (1 à 3 gouttes selon l\'abondance)'),
    item(mini(h('circle', { class: 'cy-spot', cx: 15, cy: 9, r: 2.4 })), 'Spotting'),
    item(mini(h('path', { class: 'cy-drop cy-drop--hollow', d: DROP_PATH, transform: 'translate(10 2.5)' })), 'Saignement après le retrait'),
  ]
  if (ctx.data?.settings?.showSexLog !== false) {
    items.push(
      item(mini(h('circle', { class: 'cy-sex cy-sex--protege', cx: 15, cy: 9, r: 4 })), 'Rapport protégé'),
      item(mini(h('circle', { class: 'cy-sex cy-sex--non', cx: 15, cy: 9, r: 4 })), 'Rapport non protégé'),
      item(mini(h('path', { class: 'cy-sex cy-sex--incident', d: 'M15 4 L20 13 L10 13 Z' })), 'Incident de préservatif'),
    )
  }
  return h('details', { class: 'v-cycles__legend' },
    h('summary', {}, 'Légende de la courbe'),
    h('div', { class: 'stack' },
      h('ul', { class: 'v-cycles__legend-list' }, items),
      h('div', { class: 'stack stack--sm' },
        h('h3', { class: 'eyebrow' }, 'Codes de glaire'),
        h('p', { class: 'v-cycles__codes' },
          h('span', {}, h('b', { class: 'mono' }, 't'), ' sec'),
          h('span', {}, h('b', { class: 'mono' }, '∅'), ' rien senti'),
          h('span', {}, h('b', { class: 'mono' }, 'f'), ' humide'),
          h('span', {}, h('b', { class: 'mono' }, 'S'), ' épaisse, crémeuse'),
          h('span', {}, h('b', { class: 'mono' }, 'S+'), ' filante, transparente ou mouillée'),
          h('span', {}, h('b', { class: 'mono' }, '?'), ' douteuse'))),
      h('div', { class: 'stack stack--sm' },
        h('h3', { class: 'eyebrow' }, 'Rangée « Décision »'),
        h('div', { class: 'row' },
          h('span', { class: 'badge badge--protect' }, icon(DECISION_META.protection.icon, { size: 16 }), h('span', {}, DECISION_META.protection.label)),
          h('span', { class: 'badge badge--transition' }, icon('mixed', { size: 16 }), h('span', {}, 'Protection jusqu\'à 18 h')),
          h('span', { class: 'badge badge--safe' }, icon(DECISION_META.libre.icon, { size: 16 }), h('span', {}, DECISION_META.libre.label))),
        h('p', { class: 'hint' }, 'C\'est elle qui compte pour tes rapports. Le jour de la bascule, la case est partagée : protection jusqu\'à 18 h.')),
      h('div', { class: 'stack stack--sm' },
        h('h3', { class: 'eyebrow' }, 'Rangée « État »'),
        h('div', { class: 'row' },
          Object.keys(STATE_META).map((s) => statusBadge(s)),
          statusBadge({ state: 'INFERTILE_POST', protectionNeeded: true, overlays: ['apprentissage'] })),
        h('p', { class: 'hint' }, 'La couleur suit toujours la décision : un jour infertile selon les règles, mais où la protection reste nécessaire (apprentissage, mode strict, cycle 0…), est peint « protection ». Son état est dans le détail du jour.'))))
}

/* ------------------------------------------------------------------ */
/* « Comment c'est calculé »                                           */
/* ------------------------------------------------------------------ */

function card(iconName, title, badge, ...children) {
  return h('article', { class: 'card v-cycles__explain stack stack--sm' },
    h('div', { class: 'v-cycles__explain-head' },
      h('h3', { class: 'v-cycles__explain-title' }, icon(iconName, { size: 20 }), title),
      badge),
    children)
}

function explainSection(cycle, ctx) {
  return h('section', { class: 'stack', ariaLabelledby: 'v-cycles-explain-title' },
    h('h2', { class: 'section-title', id: 'v-cycles-explain-title' }, 'Comment c\'est calculé'),
    cycle.isCycle0
      ? alertBox('info', 'info', 'Cycle 0 : tout le cycle est protégé',
        'Tant que tes premières règles après le retrait ne sont pas arrivées, chaque jour reste « protection nécessaire ». L\'évaluation ci-dessous est affichée pour apprendre à lire ta courbe.')
      : null,
    tempCard(cycle, ctx.data),
    signCard(cycle),
    doubleCard(cycle, ctx.analysis?.days || {}),
    cycle.isCycle0 ? null : preCard(cycle, ctx),
    warningsCard(cycle),
    flagsCard(cycle))
}

function tempCard(cycle, data) {
  const t = cycle.temp || {}
  const meta = TEMP_STATES[t.state] || TEMP_STATES.en_attente_valeurs_basses
  const valueOf = (iso) => fmtTempShort(data?.days?.[iso]?.temp ?? null)
  const refs = arr(t.referenceDays)
  const highs = arr(t.highDays)
  const rule = t.rule ? RULE_LABELS[t.rule] + (t.extraValue ? ' Plus 1 valeur au-dessus de la ligne (valeur post-hormonale).' : '') : null
  return card('thermo', 'Température', stateBadge(meta),
    textBlock(t.explanation),
    facts([
      ['Règle appliquée', rule],
      ['Ligne auxiliaire (L)', isTemp(t.coverline) ? fmtTemp(t.coverline) : null],
      ['6 valeurs de référence', refs.length ? refs.map((iso) => `${fmtDate(iso, 'court')} ${valueOf(iso)}`).join(' · ') : null],
      ['1re valeur haute (FHM)', t.fhm ? `${fmtDate(t.fhm, 'court')} (J${t.fhmCycleDay ?? diffDays(cycle.start, t.fhm) + 1})` : null],
      ['Valeurs hautes', highs.length ? highs.map((iso, i) => `${i + 1} : ${fmtDate(iso, 'court')} ${valueOf(iso)}`).join(' · ') : null],
      ['Confirmation (Tc)', t.confirmDay ? courtJ(t.confirmDay, cycle) : null],
      ['Valeur ignorée', arr(t.ignoredDays).map((iso) => `${fmtDate(iso, 'court')} ${valueOf(iso)}`).join(' · ') || null],
      ['Exclusions acceptées', arr(t.excludedDays).length
        ? `${arr(t.excludedDays).length} : ${arr(t.excludedDays).map((iso) => fmtDate(iso, 'court')).join(', ')}` : null],
      ['Exclusions refusées', arr(t.refusedExclusions).length
        ? `${arr(t.refusedExclusions).map((iso) => fmtDate(iso, 'court')).join(', ')} (elles serviraient à contourner la 2e exception : la valeur compte)` : null],
      ['Jours sans mesure dans la fenêtre', Number.isInteger(t.gapsInWindow) && (t.gapsInWindow > 0 || t.fhm)
        ? `${t.gapsInWindow} (au-delà de 2, la montée n'est pas retenue)` : null],
    ]),
    t.expected ? alertBox('info', 'clock', 'Ce qu\'il faut encore', t.expected) : null,
    t.borderline ? alertBox('attention', 'alert', 'Cas limite d\'arrondi', 'La valeur de confirmation dépasse la ligne de 0,15 à 0,25 °C avant arrondi. Attendre 1 à 2 jours de plus est prudent.') : null,
    t.lhDoubt ? alertBox('attention', 'flask', 'Évaluation douteuse', 'Un test LH positif après la montée de température rend l\'évaluation douteuse : attends de nouvelles valeurs.') : null)
}

function signCard(cycle) {
  const s = cycle.sign || {}
  const meta = SIGN_STATES[s.state] || SIGN_STATES.aucun_sommet
  const isCol = s.kind === 'col'
  const peakCode = !isCol && Number.isInteger(s.peakValue) ? ` · ${MUCUS_CODES[s.peakValue] ?? ''}` : ''
  return card(isCol ? 'eye' : 'drop', isCol ? 'Col de l\'utérus' : 'Glaire', stateBadge(meta),
    textBlock(s.explanation),
    facts([
      [isCol ? 'Dernier jour non « fermé et dur »' : 'Sommet (P)', s.peakDay ? `${courtJ(s.peakDay, cycle)}${peakCode}` : null],
      ['Critère rempli', s.criterionDay ? `le soir du ${fmtDate(s.criterionDay, 'court')} (${isCol ? '3e jour fermé et dur' : 'P+3'})` : null],
    ]),
    s.lowQualityPeak ? alertBox('attention', 'alert', 'Sommet de faible qualité', 'Le sommet est sur « humide » (f). C\'est accepté, mais une conseillère peut t\'aider à interpréter.') : null,
    s.state === 'bloque_donnee_manquante'
      ? alertBox('attention', 'alert', 'Observation manquante', 'Un jour sans observation après le sommet bloque l\'évaluation : il pourrait cacher un retour de glaire. Si tu complètes après coup, ne note que ce que tu as réellement observé.')
      : null)
}

function doubleCard(cycle, statuses = {}) {
  const d = cycle.double || {}
  const ok = d.state === 'confirme'
  const meta = ok
    ? (cycle.isCycle0
      ? { label: 'Confirmé (pour apprendre)', icon: 'check', cls: 'brand' }
      : { label: 'Double contrôle confirmé', icon: 'check', cls: 'safe' })
    : { label: 'Pas encore confirmé : fertile', icon: 'shield', cls: 'fertile' }
  const zb = zoneBlockers(cycle, statuses)
  const blockers = [...zb.need, ...zb.learn]
  return card('shield', 'Double contrôle', stateBadge(meta),
    textBlock(d.explanation),
    facts([
      ['Infertile à partir de', ok && d.infertileFrom ? `${fmtDate(d.infertileFrom, 'long')} à 18 h, jusqu'aux prochaines règles` : null],
      ['Règle', 'Le plus tardif des deux critères (température confirmée, signe rempli), à partir de 18 h.'],
    ]),
    ok && blockers.length
      ? alertBox('info', 'lock', 'La protection reste nécessaire', `Pour ce cycle : ${blockers.join(', ')}. L'évaluation est affichée, mais la décision reste « protection nécessaire ».`)
      : null)
}

function preCard(cycle, ctx) {
  const p = cycle.pre || {}
  const D = Number.isInteger(p.D) ? p.D : 0
  const off = ctx.data?.rules?.preOvulatoryRule === false
  const meta = D > 0
    ? { label: `${D} ${plural(D, 'jour')} en début de cycle`, icon: 'check', cls: 'safe-pre' }
    : { label: 'Fertile dès le 1er jour', icon: 'shield', cls: 'fertile' }
  return card('calendar', 'Début de cycle', stateBadge(meta),
    facts([
      ['Jours infertiles accordables (D)', String(D)],
      ['Règle', p.rule ? PRE_RULE_LABELS[p.rule] ?? p.rule : null],
      ['FHM la plus précoce', Number.isInteger(p.earliestFhmDay) ? `J${p.earliestFhmDay} (affichée pour vérification)` : null],
      ['Conditions préalables', typeof p.conditionsMet === 'boolean' ? (p.conditionsMet ? 'remplies' : 'non remplies') : null],
      ['Pourquoi D = 0', D === 0 ? (p.blockedReason || (off ? 'Règle de début de cycle désactivée' : null)) : null],
      ['Dernier jour infertile', p.lastInfertileDay ? courtJ(p.lastInfertileDay, cycle) : null],
    ]),
    h('p', { class: 'hint' }, 'L\'observation a toujours priorité : dès que la glaire apparaît (f, S ou S+), ou en cas de spotting, le jour et les suivants deviennent fertiles.'))
}

function warningsCard(cycle) {
  const list = arr(cycle.warnings)
  if (!list.length) return null
  return card('alert', 'Avertissements', null,
    list.map((w) => alertBox('attention', 'alert', null, w)))
}

function flagsCard(cycle) {
  const f = cycle.flags || {}
  const items = []
  const add = (meta, text) => items.push(h('li', { class: 'v-cycles__flag' },
    h('span', { class: ['badge', `badge--${meta.cls}`] }, icon(meta.icon, { size: 16 }), h('span', {}, meta.label)),
    text ? h('p', { class: 'hint' }, text) : null))
  if (f.learning) add(OVERLAY_META.apprentissage, 'Les 3 premiers cycles après le retrait : l\'évaluation est affichée, mais la protection reste recommandée chaque jour.')
  if (f.strictFSRH) add(OVERLAY_META.strict, 'Protection chaque jour jusqu\'à 3 cycles après le retrait et des cycles classés réguliers selon FIGO (au moins 6 cycles complets valides).')
  if (f.postHormonal) add({ label: 'Valeur post-hormonale', icon: 'flask', cls: 'brand' }, 'Une valeur haute de plus est exigée pour confirmer la montée.')
  if (f.emergencyContraception) add(OVERLAY_META.cu, `Prise le ${fmtDate(f.emergencyContraception, 'long')} : tout le cycle reste fertile jusqu'aux prochaines règles.`)
  if (f.unevaluable) {
    const from = f.unevaluableFrom ? ` à partir du ${fmtDate(f.unevaluableFrom, 'court')}` : ''
    add(OVERLAY_META.non_evaluable, `${f.unevaluableReason || 'Cycle non évaluable'}${from} : fertile jusqu'aux prochaines règles.`)
  }
  if (f.atypical) add({ label: 'Cycle atypique', icon: 'info', cls: 'neutral' }, 'Un événement (maladie, voyage, stress…) a été noté : ce cycle est exclu des prévisions et des statistiques.')
  if (cycle.anovulatoryLikely) add({ label: 'Probablement sans ovulation', icon: 'egg', cls: 'neutral' }, 'Pas de montée de température confirmée. Le cycle suivant est fertile dès le 1er jour.')
  if (cycle.ovulationEstimate?.from) {
    add({ label: 'Ovulation estimée', icon: 'egg', cls: 'brand' },
      `Entre le ${fmtDate(cycle.ovulationEstimate.from, 'court')} et le ${fmtDate(cycle.ovulationEstimate.to, 'court')}, à titre indicatif.`)
  }
  return card('info', 'Particularités du cycle', null,
    items.length ? h('ul', { class: 'v-cycles__flags' }, items) : h('p', { class: 'muted' }, 'Aucune particularité pour ce cycle.'))
}

/* ------------------------------------------------------------------ */
/* Statistiques et historique                                          */
/* ------------------------------------------------------------------ */

/** Historique : stats.history si fourni, sinon dérivé des cycles. */
function historyRows(analysis, cycles) {
  const hist = arr(analysis?.stats?.history)
  if (hist.length) return hist
  return cycles.map((c) => ({
    index: c.index,
    start: c.start,
    length: c.length ?? null,
    periodLength: c.periodLength ?? null,
    fhmDay: c.temp?.fhmCycleDay ?? null,
    highPhase: c.highPhaseLength ?? null,
    ovulatory: c.temp?.state === 'confirmee',
    atypical: !!c.flags?.atypical,
  }))
}

/** Tuile de statistique ; tone : teinte de ciel décorative (jamais verte : S5). */
function statTile(value, label, sub, tone = 'brand') {
  return h('div', { class: ['v-cycles__stat', `v-cycles__stat--${tone}`] },
    h('p', { class: 'v-cycles__stat-value' }, value),
    h('p', { class: 'v-cycles__stat-label' }, label),
    sub ? h('p', { class: 'hint' }, sub) : null)
}

function statsSection(analysis, cycles, index, ctx) {
  const s = analysis?.stats || {}
  const valid = Number.isInteger(s.validCycles) ? s.validCycles : 0
  const cl = s.cycleLength
  const pl = s.periodLength
  const hp = s.highPhase
  const tiles = [
    statTile(String(valid), plural(valid, 'cycle valide', 'cycles valides'), 'Hors cycle 0, atypiques, CU et non évaluables', 'lut'),
    cl ? statTile(`${num(cl.mean)} j`, 'Durée moyenne', `médiane ${num(cl.median)} j · ${span(cl.min, cl.max)}`, 'foll') : null,
    pl ? statTile(`${num(pl.mean)} j`, 'Règles', span(pl.min, pl.max), 'dawn') : null,
    hp ? statTile(`${num(hp.mean)} j`, 'Phase haute', `${span(hp.min, hp.max)} · ${hp.n} ${plural(hp.n, 'cycle')}`, 'ovu') : null,
    s.fhmDay && Number.isInteger(s.fhmDay.earliest) ? statTile(`J${s.fhmDay.earliest}`, 'FHM la plus précoce', 'Affichée pour vérification', 'lut') : null,
    statTile(String(Number.isInteger(s.currentD) ? s.currentD : 0), 'D du cycle en cours', 'Jours infertiles accordables en début de cycle, affiché pour vérification', 'brand'),
  ]
  const hist = historyRows(analysis, cycles)
  return h('section', { class: 'stack', ariaLabelledby: 'v-cycles-stats-title' },
    h('h2', { class: 'section-title', id: 'v-cycles-stats-title' }, 'Statistiques'),
    h('div', { class: 'card stack' },
      valid === 0 ? h('p', { class: 'muted' }, 'Les statistiques apparaîtront après ton premier cycle complet (le cycle 0 ne compte pas).') : null,
      h('div', { class: 'v-cycles__stats' }, tiles),
      regularityBlock(s.regularity, valid, ctx),
      fertileDaysBlock(s.fertileDaysPerCycle, ctx)),
    lengthsCard(hist, cycles, index, ctx),
    historyCard(hist, cycles, index, ctx))
}

function regularityBlock(reg, valid, ctx) {
  const r = reg || { status: 'inconnu', spread: null, threshold: null }
  const birthYear = ctx.data?.profile?.birthYear
  let body
  let meta
  if (r.status === 'reguliers') {
    meta = { label: 'Réguliers', icon: 'check', cls: 'safe' }
    body = `Écart de ${r.spread} j entre ton cycle le plus court et le plus long (seuil FIGO pour ton âge : ${r.threshold} j).`
  } else if (r.status === 'irreguliers') {
    meta = { label: 'Irréguliers', icon: 'alert', cls: 'neutral' }
    body = `Écart de ${r.spread} j entre ton cycle le plus court et le plus long, au-delà du seuil FIGO pour ton âge (${r.threshold} j). Ce n'est pas une urgence : parles-en lors d'une consultation programmée.`
  } else {
    meta = { label: 'Pas encore évaluable', icon: 'help', cls: 'neutral' }
    if (valid < 6) body = `Il faut au moins 6 cycles valides pour juger la régularité (tu en as ${valid}).`
    else if (!birthYear) body = 'Le seuil dépend de l\'âge : renseigne ton année de naissance dans les réglages.'
    else body = `FIGO ne définit pas de seuil de régularité pour ton âge${Number.isInteger(r.spread) ? ` (écart actuel : ${r.spread} j)` : ''}.`
  }
  return h('div', { class: 'v-cycles__reg stack stack--sm' },
    h('div', { class: 'spread' }, h('h3', { class: 'eyebrow' }, 'Régularité (FIGO)'), stateBadge(meta)),
    h('p', {}, body),
    !birthYear ? h('button', { type: 'button', class: 'btn btn--sm btn--ghost', on: { click: () => ctx.navigate('reglages') } },
      icon('gear', { size: 18 }), 'Renseigner mon année de naissance') : null)
}

function fertileDaysBlock(list, ctx) {
  const days = arr(list).filter(Number.isInteger)
  if (!days.length) return null
  const mean = Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
  return h('div', { class: 'stack stack--sm' },
    h('h3', { class: 'eyebrow' }, 'Jours à protéger par cycle'),
    h('p', {}, `En moyenne ${String(mean).replace('.', ',')} ${plural(mean, 'jour')} (de ${Math.min(...days)} à ${Math.max(...days)}).`),
    h('p', { class: 'mono muted' }, days.join(' · ')),
    ctx.data?.profile?.iudRemovalDate
      ? h('p', { class: 'hint' }, 'Beaucoup de jours à protéger dans les premiers cycles : c\'est attendu après un retrait de DIU.')
      : null)
}

function lengthsCard(hist, cycles, index, ctx) {
  const rows = hist.filter((r) => Number.isInteger(r.length))
  const title = h('h3', { class: 'v-cycles__explain-title' }, icon('chart', { size: 20 }), 'Durée des cycles')
  if (!rows.length) {
    return h('article', { class: 'card stack stack--sm' }, title,
      h('p', { class: 'muted' }, 'Le graphique apparaîtra quand un premier cycle sera terminé. La plupart des cycles durent 24 à 38 jours (FIGO).'))
  }
  const BAR = 30
  const LEFT = 30
  const TOP = 20
  const H = 150
  const BOTTOM = 30
  const maxLen = Math.max(...rows.map((r) => r.length))
  const yMax = Math.max(45, Math.ceil((maxLen + 5) / 5) * 5)
  const y = (v) => TOP + H - (Math.min(v, yMax) * H) / yMax
  const width = Math.max(LEFT + rows.length * BAR + 12, 220)
  const height = TOP + H + BOTTOM
  const gid = `cybars${++uid}`
  const g = [
    h('defs', {}, h('linearGradient', { id: `${gid}-grad`, x1: 0, y1: 0, x2: 0, y2: 1 },
      h('stop', { class: 'cy-bar-stop', offset: '0' }),
      h('stop', { class: 'cy-bar-stop cy-bar-stop--end', offset: '1' }))),
    h('rect', { class: 'cy-figo', x: LEFT, y: y(38), width: width - LEFT - 6, height: y(24) - y(38) }),
    h('text', { class: 'cy-figo-label', x: LEFT + 4, y: y(38) - 4 }, 'Normal FIGO : 24 à 38 j'),
  ]
  for (let v = 0; v <= yMax; v += 10) {
    g.push(h('line', { class: 'cy-grid', x1: LEFT, x2: width - 6, y1: y(v), y2: y(v) }))
    g.push(h('text', { class: 'cy-axis-label', x: LEFT - 5, y: y(v) + 4, textAnchor: 'end' }, String(v)))
  }
  rows.forEach((r, k) => {
    const c = cycles[r.index]
    const x = LEFT + k * BAR + 5
    const w = BAR - 10
    const selected = r.index === index
    const out = r.length < 24 || r.length > 38
    const go = () => ctx.navigate('cycles', { cycle: r.index })
    const label = `Cycle ${cycleShort(c, cycles, ctx.data)} : ${r.length} jours${out ? ', hors de la plage FIGO' : ''}${r.atypical ? ', atypique' : ''}. Afficher ce cycle.`
    g.push(h('g', {
      class: ['cy-barg', selected && 'is-selected'], role: 'button', ariaLabel: label,
      attrs: { tabindex: 0, 'aria-current': selected ? 'true' : null },
      on: { click: go, keydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go() } } },
    },
    h('rect', { class: 'cy-hit', x: x - 5, y: TOP - 18, width: BAR, height: H + BOTTOM + 18 }),
    h('rect', {
      class: ['cy-bar', r.atypical && 'cy-bar--atypical', out && 'cy-bar--out', selected && 'cy-bar--selected'],
      fill: r.atypical || out ? null : `url(#${gid}-grad)`,
      x, y: y(r.length), width: w, height: y(0) - y(r.length), rx: 5,
    }),
    selected ? h('circle', { class: 'cy-bar-star', cx: x + w / 2, cy: y(r.length) - 17, r: 3 }) : null,
    h('text', { class: ['cy-bar-value', out && 'cy-bar-value--out'], x: x + w / 2, y: y(r.length) - 5, textAnchor: 'middle' }, `${r.length}${out ? '!' : ''}`),
    h('text', { class: ['cy-bar-label', selected && 'cy-bar-label--selected'], x: x + w / 2, y: TOP + H + 16, textAnchor: 'middle' }, cycleShort(c, cycles, ctx.data))))
  })
  g.push(h('text', { class: 'cy-axis-label', x: LEFT, y: height - 2 }, 'Cycle'))
  return h('article', { class: 'card stack stack--sm' }, title,
    h('div', { class: 'v-cycles__scroll v-cycles__scroll--bars', tabIndex: 0, ariaLabel: 'Graphique des durées de cycles' },
      h('svg', { class: 'cy-bars', width, height, viewBox: `0 0 ${width} ${height}`, role: 'group', ariaLabel: 'Durée de chaque cycle terminé, en jours' }, g)),
    h('p', { class: 'hint' }, 'En jours. « ! » : hors de la plage FIGO. Barre vide : cycle atypique, exclu des statistiques. Point doré : cycle affiché. Touche une barre pour afficher le cycle.'))
}

/** Nombre au format français (virgule décimale, 1 décimale au plus). */
function num(n) {
  return typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : '—'
}

/** « de 27 à 29 j », ou « toujours 14 j » quand min = max. */
function span(min, max) {
  return min === max ? `toujours ${num(min)} j` : `de ${num(min)} à ${num(max)} j`
}

function historyCard(hist, cycles, index, ctx) {
  const last = cycles.length - 1
  const yes = (txt) => h('span', { class: 'v-cycles__yes' }, icon('check', { size: 16 }), txt)
  const body = hist.slice().reverse().map((r) => {
    const c = cycles[r.index]
    const selected = r.index === index
    const current = r.index === last && !c?.end
    const go = () => ctx.navigate('cycles', { cycle: r.index })
    const dur = Number.isInteger(r.length) ? `${r.length} j` : current ? `en cours (J${c?.dayCount ?? '—'})` : '—'
    const ovu = r.ovulatory ? yes('Oui') : current ? h('span', { class: 'muted' }, 'pas encore')
      : c?.isCycle0 ? h('span', { class: 'muted' }, '—') : h('span', {}, 'Non')
    return h('tr', { class: [selected && 'is-selected'], attrs: { 'aria-current': selected ? 'true' : null }, on: { click: go } },
      h('th', { scope: 'row' },
        h('button', {
          type: 'button', class: 'v-cycles__rowbtn',
          ariaLabel: `Afficher : ${c ? cycleTitle(c, cycles, ctx.data) : `cycle ${r.index}`}`,
          on: { click: (ev) => { ev.stopPropagation(); go() } },
        }, cycleShort(c, cycles, ctx.data))),
      h('td', {}, r.start ? fmtDate(r.start, 'court') : '—'),
      h('td', {}, dur),
      h('td', {}, Number.isInteger(r.periodLength) && r.periodLength > 0 ? `${r.periodLength} j` : '—'),
      h('td', {}, Number.isInteger(r.fhmDay) ? `J${r.fhmDay}` : '—'),
      h('td', {}, Number.isInteger(r.highPhase) ? `${r.highPhase} j` : '—'),
      h('td', {}, ovu),
      h('td', {}, r.atypical ? h('span', { class: 'v-cycles__atyp' }, icon('info', { size: 16 }), 'Oui') : '—'))
  })
  return h('article', { class: 'card stack stack--sm' },
    h('h3', { class: 'v-cycles__explain-title' }, icon('calendar', { size: 20 }), 'Historique'),
    h('div', { class: 'v-cycles__tablewrap', tabIndex: 0, ariaLabel: 'Historique des cycles, défilement horizontal' },
      h('table', { class: 'v-cycles__table' },
        h('caption', { class: 'sr-only' }, 'Historique des cycles : touche un cycle pour l\'afficher'),
        h('thead', {}, h('tr', {},
          ['Cycle', 'Début', 'Durée', 'Règles', 'FHM', 'Phase haute', 'Ovulatoire', 'Atypique'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, body))))
}

/* ------------------------------------------------------------------ */
/* Renvois et état vide                                                */
/* ------------------------------------------------------------------ */

function readMore(ctx) {
  const link = (article, title, iconName) => h('button', {
    type: 'button', class: 'btn btn--block v-cycles__more',
    on: { click: () => ctx.navigate('comprendre', { article }) },
  }, icon(iconName, { size: 20 }), h('span', {}, title), icon('chevron-right', { size: 18 }))
  return h('section', { class: 'stack stack--sm', ariaLabelledby: 'v-cycles-more-title' },
    h('h2', { class: 'section-title', id: 'v-cycles-more-title' }, 'Pour aller plus loin'),
    link('decision', 'Comment la décision du jour est prise', 'shield'),
    link('temperature', 'Bien mesurer et lire ta température', 'thermo'))
}

function renderEmpty(wrap, ctx, today) {
  wrap.append(
    h('header', { class: 'stack stack--sm' }, h('h1', {}, 'Cycles')),
    h('section', { class: 'empty v-cycles__empty' },
      icon('chart', { size: 32 }),
      h('h2', { class: 'section-title' }, 'Ta courbe apparaîtra ici'),
      h('p', {}, 'Dès ta première température, cette page devient ta feuille de relevé, jour après jour.')),
    h('section', { class: 'card stack' },
      h('h2', { class: 'section-title' }, 'À quoi ressemblera ta courbe'),
      sampleChart(),
      h('ol', { class: 'v-cycles__steps' },
        h('li', {}, 'Chaque matin, un point : ta température au réveil, avant de te lever.'),
        h('li', {}, 'Sous la courbe, une rangée par signe : saignements, glaire (t, ∅, f, S, S+), tests LH.'),
        h('li', {}, 'Quand 3 valeurs dépassent les 6 précédentes, l\'app trace la ligne auxiliaire et numérote 1, 2, 3.'),
        h('li', {}, 'Le dernier jour de glaire de meilleure qualité est marqué P, puis 1, 2, 3.'),
        h('li', {}, 'Quand température et glaire concordent (double contrôle), la zone infertile s\'affiche, à partir de 18 h.')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--primary', on: { click: () => ctx.navigate('noter', today ? { date: today } : {}) } },
          icon('plus', { size: 20 }), 'Noter aujourd\'hui'),
        h('button', { type: 'button', class: 'btn btn--ghost', on: { click: () => ctx.navigate('comprendre', { article: 'temperature' }) } },
          icon('book', { size: 20 }), 'Bien mesurer ta température'))))
}

/** Illustration statique d'une courbe type (6 valeurs basses, ligne, 1-2-3, zone infertile). */
function sampleChart() {
  const temps = [3635, 3640, 3625, 3645, 3630, 3650, 3640, 3635, 3670, 3680, 3700, 3695, 3705, 3690]
  const W = 20
  const lo = 3600
  const hi = 3730
  const top = 10
  const H = 120
  const y = (v) => top + ((hi - v) * H) / (hi - lo)
  const x = (i) => i * W + W / 2 + 4
  const g = []
  for (let v = lo; v <= hi; v += 10) g.push(h('line', { class: ['cy-grid', v % 50 === 0 && 'cy-grid--strong'], x1: 4, x2: temps.length * W + 4, y1: y(v), y2: y(v) }))
  g.push(h('rect', { class: 'cy-zone', x: x(10) + W * 0.25, y: top, width: (temps.length - 10.75) * W, height: H }))
  g.push(h('line', { class: 'cy-coverline', x1: x(2) - W / 2, x2: x(10) + W / 2, y1: y(3650), y2: y(3650) }))
  g.push(h('polyline', { class: 'cy-line', points: temps.map((t, i) => `${x(i)},${y(t)}`).join(' ') }))
  temps.forEach((t, i) => {
    g.push(h('circle', { class: 'cy-pt', cx: x(i), cy: y(t), r: 3.4 }))
    if (i >= 2 && i <= 7) g.push(h('line', { class: 'cy-ref', x1: x(i) - 5, x2: x(i) + 5, y1: y(t) + 7, y2: y(t) + 7 }))
    if (i >= 8 && i <= 10) g.push(h('text', { class: 'cy-highnum', x: x(i), y: y(t) - 8, textAnchor: 'middle' }, String(i - 7)))
  })
  const width = temps.length * W + 8
  return h('svg', {
    class: 'v-cycles__sample', width: '100%', viewBox: `0 0 ${width} ${top + H + 6}`, role: 'img',
    ariaLabel: 'Exemple de courbe : six valeurs basses soulignées, une ligne auxiliaire en tirets, puis trois valeurs hautes numérotées 1, 2, 3 et la zone infertile ombrée.',
  }, g)
}
