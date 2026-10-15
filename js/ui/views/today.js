// Vue « Aujourd'hui » (route 'aujourdhui') : héros « ciel », décision du jour, saisie à faire,
// semaine, mini-courbe, prévisions, alertes, conseil. Contrat : ARCHITECTURE.md §5.2, §6.1.
// Direction « Ciel de Lune » : le ciel est décoratif (phase), seule la décision
// (DayStatus.protectionNeeded) peint les cases et la carte (S1–S3).

import {
  h, icon, fmtDate, fmtTemp, fmtTempShort, plural, statusBadge, richText, addDays, diffDays,
  decisionLook, skyArcSvg, moonSvg, moonFraction, moonShapeName, SKY_META,
  STATE_META, DECISION_META, PHASE_META, OVERLAY_META,
  BLEEDING_LEVELS, MUCUS_SENSATIONS, MUCUS_ASPECTS, CERVIX_OPENING, CERVIX_FIRMNESS,
} from '../dom.js'
import { PHASE_TIPS } from '../../content/tips.js'

/* ------------------------------------------------------------------ */
/* Libellés propres à la vue                                           */
/* ------------------------------------------------------------------ */

/** Abréviations (bande de 7 jours) selon l'état des règles, quand la décision le suit. */
const STATE_ABBR = {
  FERTILE: 'fert.',
  INDETERMINE: 'indét.',
  FERTILE_JUSQU_A_18H: '→ 18 h',
  INFERTILE_PRE: 'inf.',
  INFERTILE_POST: 'inf.',
}

/**
 * Jours futurs (Predictions.futureDays), par ordre de priorité d'affichage.
 * `kind` : pastille prévue (toujours en pointillés, jamais d'aplat : S2) ; null = aucune décision prévue.
 * Les règles prévues ne sont qu'un marqueur (barre aube pointillée, S3) : jamais une décision.
 */
const FUTURE_META = {
  regles_prevues: { label: 'Règles possibles (prévision indicative)', kind: null, icon: 'forecast', period: true },
  ovulation_estimee: { label: 'Ovulation estimée (prévision indicative)', kind: 'protect', icon: 'shield' },
  fertile_estime: { label: 'Fenêtre fertile estimée (prévision indicative)', kind: 'protect', icon: 'shield' },
  infertile_post_suite: { label: 'Infertile jusqu\'aux prochaines règles (suite du double contrôle)', kind: 'safe', icon: 'check' },
}
const FUTURE_ORDER = ['regles_prevues', 'ovulation_estimee', 'fertile_estime', 'infertile_post_suite']

/** Pourquoi la décision est plus prudente que les règles (surcouche → motif). */
const OVERRIDE_CAUSES = {
  apprentissage: 'cycle d\'apprentissage',
  strict: 'mode strict FSRH actif',
  cu: 'contraception d\'urgence en cours',
  cycle0: 'cycle 0, avant tes premières règles',
  non_evaluable: 'cycle non évaluable',
  douteux_lh: 'évaluation douteuse (test LH)',
}

const TEMP_STATE_LABEL = {
  confirmee: 'Montée confirmée',
  en_attente: 'Montée en cours de vérification',
  en_attente_valeurs_basses: 'En attente de 6 valeurs basses',
  aucune_montee: 'Pas de montée détectée',
  non_evaluable: 'Non évaluable',
}
const TEMP_RULE_LABEL = {
  reguliere: 'Règle régulière : 3 valeurs au-dessus de la ligne, la 3e au moins 0,20 °C au-dessus',
  exception1: 'Exception 1 : la 3e valeur n\'atteint pas +0,20 °C, une 4e valeur au-dessus de la ligne a confirmé',
  exception2: 'Exception 2 : une seule des 2e et 3e valeurs est retombée sur ou sous la ligne (non comptée) ; la 4e mesure (3e valeur haute comptée) dépasse la ligne d\'au moins 0,20 °C',
}
const SIGN_STATE_LABEL = {
  confirme: 'Critère confirmé',
  en_attente: 'En attente',
  bloque_donnee_manquante: 'Bloqué : une observation manque',
  aucun_sommet: 'Pas encore de jour sommet',
}
const PEAK_CODE = { 2: 'f', 3: 'S', 4: 'S+' }
const PRE_RULE_LABEL = { cinq_jours: 'règle des 5 jours', moins_8: 'règle du moins 8' }
const CONFIDENCE_LABEL = { faible: 'Faible', moyenne: 'Moyenne', bonne: 'Bonne' }
const ALERT_ICON = { urgent: 'alert', attention: 'alert', info: 'info' }

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const isTemp = (t) => Number.isInteger(t)
const arr = (x) => (Array.isArray(x) ? x : [])
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const labelOf = (list, id) => list.find((o) => o.id === id)?.label ?? null
/** Termine une phrase par un point, sans doubler celui d'une abréviation (« oct. »). */
const sentence = (s) => (s.endsWith('.') ? s : `${s}.`)

/** Numéro de jour stable (déterministe) d'une date, pour choisir le conseil du jour. */
function dayIndex(iso) {
  return diffDays('2000-01-01', iso) ?? 0
}

/** Liste des dates de `from` à `to` inclus (bornée par sécurité). */
function dateRange(from, to, max = 400) {
  const out = []
  for (let iso = from, i = 0; iso && iso <= to && i < max; iso = addDays(iso, 1), i++) out.push(iso)
  return out
}

/** Jour de cycle d'une date (DayStatus si connu, sinon calculé). */
function cycleDayOf(analysis, cycle, iso) {
  const d = analysis.days?.[iso]?.cycleDay
  if (Number.isInteger(d)) return d
  return cycle?.start ? diffDays(cycle.start, iso) + 1 : null
}

function section(cls, ...children) {
  return h('section', { class: ['card', cls] }, ...children)
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

/**
 * Affiche la vue « Aujourd'hui ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 */
export function render(root, ctx) {
  root.classList.add('v-today', 'stack')
  const analysis = ctx.analysis
  const current = analysis?.current ?? null
  if (!current || !current.status) {
    // Même sans données, les alertes (ex. rapport à risque avant le retrait) doivent s'afficher.
    root.append(...[alertsList(ctx, arr(analysis?.alerts)), emptyState(ctx), urgenceLink(ctx)].filter(Boolean))
    return
  }
  const cycle = arr(analysis.cycles)[current.cycleIndex] ?? null
  const alerts = arr(analysis.alerts)
  const urgent = alerts.filter((a) => a?.level === 'urgent')
  const others = alerts.filter((a) => a && a.level !== 'urgent')

  // Element.append() écrirait « null » : on filtre les blocs absents.
  root.append(...[
    hero(ctx, current, cycle),
    decisionCard(ctx, current, cycle),
    alertsList(ctx, urgent),
    todoCard(ctx, current, cycle),
    weekStrip(ctx, current, cycle),
    miniCurve(ctx, cycle),
    predictionsCard(analysis.predictions),
    alertsList(ctx, others),
    tipCard(ctx, current),
    urgenceLink(ctx),
  ].filter(Boolean))
}

/* ---------- État vide ---------- */

function emptyState(ctx) {
  return h('section', { class: 'empty v-today-empty' },
    h('span', { class: 'v-today-empty__moon' }, moonSvg(5, 28, { size: 72, label: null })),
    h('h1', { class: 'v-today-empty__title' }, 'Bienvenue dans Lune'),
    h('p', {}, 'Chaque jour, note ta température au réveil, ta glaire et tes saignements. Lune applique les règles du double contrôle et te dit si une protection est nécessaire.'),
    h('p', { class: 'v-today-empty__strong' }, 'Tant qu\'il n\'y a pas de données, considère chaque jour comme fertile.'),
    removalNote(ctx),
    h('div', { class: 'v-today-empty__actions' },
      h('button', {
        type: 'button',
        class: 'btn btn--primary',
        on: { click: () => ctx.navigate('noter', { date: ctx.now.today }) },
      }, icon('plus'), 'Noter mon premier jour'),
      h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        on: { click: () => ctx.navigate('comprendre', { article: 'bien-demarrer' }) },
      }, icon('book'), 'Bien démarrer')),
  )
}

/** Retrait du stérilet à venir : rappel de protection dès maintenant (règle des 7 jours). */
function removalNote(ctx) {
  const removal = ctx.data?.profile?.iudRemovalDate
  if (!removal || !ctx.now?.today || removal <= ctx.now.today) return null
  return h('p', {}, `Retrait du stérilet prévu le ${fmtDate(removal, 'long')}. Protège-toi dès maintenant : les spermatozoïdes peuvent survivre jusqu'à 7 jours, et la fertilité revient dès le retrait.`)
}

/* ---------- 1. Héros « ciel » ---------- */

/** Classe du point de couleur de la phase (segments de l'arc). */
const PHASE_DOT = { regles: 'regles', folliculaire: 'foll', ovulatoire: 'ovu', luteale: 'lut', inconnue: 'none' }

/**
 * Libellé de phase affiché dans le héros. Discrétion (S7) : jamais le mot « règles »
 * dans le héros, la phase des règles s'y appelle « Début de cycle ».
 */
function heroPhaseLabel(phase) {
  if (phase === 'regles') return 'Début de cycle'
  return PHASE_META[phase]?.label ?? PHASE_META.inconnue.label
}

/**
 * Durée de cycle de l'arc : prochaines règles prévues, sinon durée moyenne, sinon 28.
 * Un jour au-delà de cette durée allonge l'arc (skyArcSvg).
 */
export function expectedCycleLength(analysis, cycle) {
  const np = analysis?.predictions?.nextPeriod?.date
  if (cycle?.start && np) {
    const n = diffDays(cycle.start, np)
    if (Number.isInteger(n) && n >= 15 && n <= 60) return n
  }
  const mean = analysis?.stats?.cycleLength?.mean
  if (Number.isFinite(mean) && mean >= 15 && mean <= 60) return Math.round(mean)
  return 28
}

/**
 * Segments de phase de l'arc (jours de cycle, bornes incluses) :
 * règles = jours de règles du cycle ; ovulatoire = FHM−2 … FHM (montée confirmée) ;
 * lutéale après la FHM. Sans montée confirmée : ovulation estimée par les prévisions
 * si elle tombe dans ce cycle, sinon répartition indicative (ovulation vers len − 14).
 * Décor seulement : n'influence aucune décision.
 * @returns {Array<{phase: string, from: number, to: number}>}
 */
export function arcPhases(analysis, cycle, len, day) {
  if (!cycle) return []
  const L = Math.max(len, Number.isInteger(day) ? day : 0)
  const periodLen = arr(cycle.periodDays).length || cycle.periodLength || Math.round(analysis?.stats?.periodLength?.mean ?? 0) || 5
  const P = Math.min(Math.max(1, periodLen), Math.max(1, L - 3))
  const t = cycle.temp ?? {}
  let ovuFrom = null
  let ovuTo = null
  if (t.state === 'confirmee' && Number.isInteger(t.fhmCycleDay)) {
    ovuTo = t.fhmCycleDay
    ovuFrom = ovuTo - 2
  } else {
    const o = analysis?.predictions?.ovulation
    const from = o && cycle.start ? diffDays(cycle.start, o.from) + 1 : null
    const to = o && cycle.start ? diffDays(cycle.start, o.to) + 1 : null
    if (Number.isInteger(from) && Number.isInteger(to) && from > P && to >= from && to < L) {
      ovuFrom = from
      ovuTo = to
    } else {
      ovuTo = L - 14
      ovuFrom = ovuTo - 2
    }
  }
  ovuFrom = Math.max(ovuFrom, P + 1)
  ovuTo = Math.min(Math.max(ovuTo, ovuFrom), L - 1)
  const out = [{ phase: 'regles', from: 1, to: P }]
  if (ovuFrom > P + 1) out.push({ phase: 'folliculaire', from: P + 1, to: ovuFrom - 1 })
  if (ovuTo >= ovuFrom) out.push({ phase: 'ovulatoire', from: ovuFrom, to: ovuTo })
  if (L >= ovuTo + 1) out.push({ phase: 'luteale', from: Math.max(ovuTo + 1, P + 1), to: L })
  return out.filter((p) => p.to >= p.from)
}

function hero(ctx, current, cycle) {
  const { now, data, analysis } = ctx
  const phase = PHASE_META[current.status.phase] ? current.status.phase : 'inconnue'
  const removal = data?.profile?.iudRemovalDate || null
  const day = Number.isInteger(current.cycleDay) && current.cycleDay >= 1 ? current.cycleDay : 1

  // Chiffre et suffixe (« Jour 20 du cycle », « Jour 3 depuis le retrait », « Jour 5 de suivi »).
  let number = current.cycleDay
  let suffix = 'du cycle'
  let pill = null
  if (current.isCycle0) {
    const sinceRemoval = removal ? diffDays(removal, now.today) : null
    if (sinceRemoval !== null && sinceRemoval >= 0) {
      number = sinceRemoval + 1
      suffix = 'depuis le retrait'
      pill = ['Cycle 0', ' · depuis le retrait']
    } else {
      suffix = 'de suivi'
      pill = removal ? ['Retrait', ` le ${fmtDate(removal, 'court')}`] : ['Cycle 0', ' · jours de suivi']
    }
  } else if (Number.isInteger(current.postRemovalNumber) && current.postRemovalNumber >= 1) {
    pill = [`Cycle ${current.postRemovalNumber}`, ' après le retrait']
  } else if (cycle?.start) {
    pill = ['Depuis', ` le ${fmtDate(cycle.start, 'court')}`]
  }

  const len = current.isCycle0 ? 28 : expectedCycleLength(analysis, cycle)
  const arcLen = Math.max(len, day)
  const phases = current.isCycle0 ? [] : arcPhases(analysis, cycle, len, day)
  const skyName = (SKY_META[current.isCycle0 ? 'inconnue' : phase] ?? SKY_META.inconnue).sky
  const shape = moonShapeName(moonFraction(day, arcLen))
  const arcLabel = current.isCycle0
    ? `Ciel du cycle 0 : jour ${day}, en attente du premier cycle ; ${shape}`
    : `Ciel du cycle : jour ${day} sur ${arcLen} environ, ${skyName} ; ${shape}`

  const sea = current.isCycle0
    ? h('p', { class: 'v-today-hero__phase' },
      h('span', { class: 'v-today-hero__dot v-today-hero__dot--none' }),
      h('span', {}, 'En attente du premier cycle'))
    : h('p', { class: 'v-today-hero__phase' },
      h('span', { class: `v-today-hero__dot v-today-hero__dot--${PHASE_DOT[phase]}` }),
      h('span', {}, heroPhaseLabel(phase), h('span', { class: 'v-today-hero__note' }, ' · repère indicatif')))

  return h('section', { class: ['v-today-hero', 'sky'], ariaLabelledby: 'v-today-hero-title', dataset: { phase: current.isCycle0 ? 'inconnue' : phase } },
    h('div', { class: 'v-today-hero__art' },
      skyArcSvg({ cycleDay: day, cycleLength: len, phases, phase: current.isCycle0 ? 'inconnue' : phase, label: arcLabel })),
    h('div', { class: 'v-today-hero__top' },
      h('p', { class: 'v-today-hero__date' }, capitalize(fmtDate(now.today, 'long'))),
      pill ? h('p', { class: 'v-today-hero__pill' }, h('strong', {}, pill[0]), pill[1]) : null),
    h('h1', { class: 'v-today-hero__day', id: 'v-today-hero-title' },
      h('span', { class: 'v-today-hero__jour' }, 'Jour '),
      h('span', { class: 'v-today-hero__num' }, String(number ?? '—')),
      // Suffixe long (cycle 0) : lu par les lecteurs d'écran, montré dans la pastille du haut
      // (il déborderait sur l'arc).
      h('span', { class: ['v-today-hero__suffix', suffix !== 'du cycle' && 'sr-only'] }, ` ${suffix}`)),
    h('div', { class: 'v-today-hero__sea' },
      h('span', { class: 'v-today-hero__end v-today-hero__end--start mono', ariaHidden: 'true' }, 'J1'),
      sea,
      current.isCycle0 ? null : h('span', { class: 'v-today-hero__end v-today-hero__end--end mono', ariaHidden: 'true' }, `J${arcLen}`)),
  )
}

/* ---------- 2. Carte décision ---------- */

function decisionCard(ctx, current, cycle) {
  const st = current.status
  // S1 : la carte suit TOUJOURS la décision (protectionNeeded), jamais l'état des règles seul.
  const protect = st.protectionNeeded !== false
  const meta = DECISION_META[protect ? 'protection' : 'libre']
  const stateMeta = STATE_META[st.state] ?? STATE_META.INDETERMINE
  const overlays = arr(st.overlays)
  // Un mode prudent (apprentissage, strict, CU…) ou un blocage du jour de bascule (K1) annule la bascule de 18 h.
  const held = overlays.some((o) => OVERRIDE_CAUSES[o]) || st.eveningSwitch?.blocked === true
  const transition = /18\s?h/.test(current.headline || '') || (st.state === 'FERTILE_JUSQU_A_18H' && !held)
  const blockedSwitch = protect && !transition && st.state === 'FERTILE_JUSQU_A_18H'
  const kind = cycle?.sign?.kind ?? ctx.data?.profile?.secondarySign ?? 'glaire'

  let look = 'protect'
  if (protect && transition) look = 'mixed'
  else if (!protect) look = st.state === 'INFERTILE_PRE' ? 'pre' : 'safe'
  const iconName = look === 'mixed' ? 'mixed' : meta.icon
  const headline = current.headline || meta.label

  const lines = []
  if (transition) {
    lines.push(h('p', { class: 'v-today-decision__switch' },
      icon('clock', { size: 18 }),
      h('span', {}, protect
        ? h('strong', {}, 'À partir de 18 h : infertile jusqu\'aux prochaines règles.')
        : h('strong', {}, 'Depuis 18 h : infertile jusqu\'aux prochaines règles.'))))
  } else if (!protect && st.state === 'INFERTILE_POST' && cycle?.double?.infertileFrom === ctx.now.today) {
    lines.push(h('p', { class: 'v-today-decision__switch' },
      icon('clock', { size: 18 }),
      h('span', {}, h('strong', {}, 'Depuis 18 h ce soir : infertile jusqu\'aux prochaines règles.'))))
  }
  if (current.detail) lines.push(h('p', { class: 'v-today-decision__detail' }, richText(current.detail)))
  // Le motif détaillé (decisionReason) reprend presque mot pour mot detail : il est affiché
  // dans « Comment c'est calculé ? » pour garder la carte lisible.
  if (protect && !transition && (!stateMeta.fertile || st.state === 'FERTILE_JUSQU_A_18H')) lines.push(overrideLine(st, overlays))

  const badges = overlays
    .filter((o) => OVERLAY_META[o])
    .map((o) => {
      const om = OVERLAY_META[o]
      const label = o === 'a_confirmer'
        ? `À confirmer : observe ${kind === 'col' ? 'ton col' : 'ta glaire'} aujourd'hui`
        : om.label
      return h('span', { class: ['badge', `badge--${om.cls}`] }, icon(om.icon, { size: 16 }), h('span', {}, label))
    })

  const reassure = protect && overlays.some((o) => o === 'apprentissage' || o === 'cycle0' || o === 'strict')
    ? 'Beaucoup de jours à protéger après un retrait de DIU : c\'est attendu.'
    : null

  const noteText = meta.note || null

  const head = h('div', { class: 'v-today-decision__top' },
    h('span', { class: 'v-today-decision__icon' }, icon(iconName, { size: 30 })),
    h('div', { class: 'v-today-decision__heading' },
      h('p', { class: 'eyebrow v-today-decision__eyebrow' }, 'Décision du jour'),
      h('h2', { class: 'v-today-decision__title', id: 'v-today-decision-title' }, headline)))

  const body = [
    look === 'mixed' ? dayTimeline('mixed') : null,
    blockedSwitch ? dayTimeline('blocked') : null,
    lines.length ? h('div', { class: 'v-today-decision__body' }, lines) : null,
    badges.length ? h('div', { class: 'v-today-decision__badges' }, badges) : null,
    noteText || reassure ? h('p', { class: 'v-today-decision__note' }, noteText, noteText && reassure ? ' ' : null, reassure) : null,
    h('button', {
      type: 'button',
      class: 'btn btn--sm v-today-decision__how',
      on: { click: () => openExplain(ctx, current, cycle) },
    }, icon('help', { size: 18 }), 'Comment c\'est calculé ?'),
  ]

  return h('section', {
    class: ['v-today-decision', `v-today-decision--${look}`, look === 'mixed' && 'v-today-decision--transition'],
    ariaLabelledby: 'v-today-decision-title',
    dataset: { decision: protect ? 'protection' : 'libre' },
  },
  h('div', { class: 'v-today-decision__band' }, head),
  h('div', { class: 'v-today-decision__main' }, body))
}

/**
 * Frise horaire 0 h → 24 h.
 * - 'mixed' : protection jusqu'à 18 h (hachuré, bouclier), puis pas de protection selon les règles (uni, coche).
 * - 'blocked' : jour de bascule dont la bascule n'est pas appliquée : protection toute la journée.
 */
function dayTimeline(kind) {
  const mixed = kind === 'mixed'
  return h('div', { class: ['v-today-switchbar', `v-today-switchbar--${kind}`] },
    h('div', {
      class: 'v-today-switchbar__track',
      role: 'img',
      ariaLabel: mixed
        ? 'Frise du jour : protection nécessaire de minuit à 18 h, puis pas de protection nécessaire selon les règles'
        : 'Frise du jour : protection nécessaire toute la journée, la bascule de 18 h n\'est pas appliquée',
    },
    h('span', { class: 'v-today-switchbar__seg v-today-switchbar__seg--before' }, icon('shield', { size: 18 })),
    mixed
      ? h('span', { class: 'v-today-switchbar__seg v-today-switchbar__seg--after' }, icon('check', { size: 18 }))
      : h('span', { class: 'v-today-switchbar__seg v-today-switchbar__seg--held' }, icon('shield', { size: 18 }))),
    h('div', { class: 'v-today-switchbar__scale mono', ariaHidden: 'true' },
      h('span', {}, '0 h'),
      h('span', { class: 'v-today-switchbar__mark' }, '18 h'),
      h('span', {}, '24 h')),
    mixed ? null : h('p', { class: 'v-today-switchbar__caption' }, 'Bascule de 18 h non appliquée : protection toute la journée.'))
}

/** « Les règles disent infertile, mais … : protection recommandée. » (règles moins prudentes que la décision) */
function overrideLine(st, overlays) {
  const causes = overlays.filter((o) => OVERRIDE_CAUSES[o]).map((o) => OVERRIDE_CAUSES[o])
  if (overlays.includes('a_confirmer')) causes.push('l\'observation du jour n\'est pas encore notée')
  const rules = st.state === 'FERTILE_JUSQU_A_18H' ? 'infertile à partir de 18 h' : 'infertile'
  const why = causes.length
    ? `Les règles disent ${rules}, mais ${causes.join(' et ')} : protection recommandée.`
    : `Les règles disent ${rules}, mais la décision reste prudente : protection recommandée.`
  return h('div', { class: 'v-today-decision__rules' },
    h('span', { class: 'v-today-decision__rules-label' }, 'Selon les règles'),
    statusBadge(st),
    h('p', {}, why))
}

/* ---------- « Comment c'est calculé ? » ---------- */

function openExplain(ctx, current, cycle) {
  let close = () => {}
  const content = explainContent(ctx, current, cycle, () => {
    close()
    ctx.navigate('comprendre', { article: 'decision' })
  })
  close = ctx.ui.openSheet({ title: 'Comment c\'est calculé ?', content })
}

function explainSection(title, iconName, ...children) {
  return h('section', { class: 'v-today-explain__sec' },
    h('h3', { class: 'v-today-explain__title' }, icon(iconName, { size: 18 }), h('span', {}, title)),
    ...children)
}

function facts(rows) {
  const items = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '')
  if (!items.length) return null
  return h('dl', { class: 'v-today-explain__facts' },
    items.map(([k, v]) => h('div', { class: 'v-today-explain__fact' }, h('dt', {}, k), h('dd', {}, v))))
}

function note(text, cls = '') {
  return text ? h('p', { class: ['v-today-explain__note', cls] }, richText(text)) : null
}

function explainContent(ctx, current, cycle, openArticle) {
  const { analysis, data } = ctx
  const st = current.status
  const tempOf = (iso) => data?.days?.[iso]?.temp
  const dayLabel = (iso) => {
    const n = cycleDayOf(analysis, cycle, iso)
    return `${n ? `J${n} · ` : ''}${fmtDate(iso, 'court')}`
  }
  const valueChip = (iso, prefix) => h('li', { class: 'v-today-explain__val' },
    prefix ? h('span', { class: 'v-today-explain__num' }, prefix) : null,
    h('span', {}, dayLabel(iso)),
    h('span', { class: 'mono' }, isTemp(tempOf(iso)) ? fmtTempShort(tempOf(iso)) : '—'))

  const parts = []

  parts.push(explainSection('Décision du jour', DECISION_META[st.protectionNeeded !== false ? 'protection' : 'libre'].icon,
    h('p', {}, h('strong', {}, current.headline || '')),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Selon les règles :'), statusBadge(st)),
    note(st.stateReason),
    note(st.decisionReason),
    note('Principe : **tout jour est fertile tant que les mesures n\'ont pas prouvé le contraire.** Une donnée manquante ou un doute donnent « Protection nécessaire ».', 'muted'),
  ))

  if (!cycle) {
    parts.push(note('Le détail du calcul apparaîtra dès que le cycle en cours aura des données.', 'muted'))
  } else {
    const t = cycle.temp ?? {}
    const high = arr(t.highDays)
    const tempChildren = [
      facts([
        ['État', TEMP_STATE_LABEL[t.state] ?? '—'],
        ['Ligne auxiliaire', isTemp(t.coverline) ? fmtTemp(t.coverline) : null],
        ['1re valeur haute', t.fhm ? `${fmtDate(t.fhm, 'long')}${Number.isInteger(t.fhmCycleDay) ? ` (J${t.fhmCycleDay})` : ''}` : null],
        ['Confirmée le', t.confirmDay ? fmtDate(t.confirmDay, 'long') : null],
        ['Règle appliquée', TEMP_RULE_LABEL[t.rule] ?? null],
      ]),
      t.extraValue ? note('Une **valeur haute supplémentaire** est exigée (après une contraception hormonale).') : null,
      arr(t.referenceDays).length ? h('div', { class: 'v-today-explain__group' },
        h('p', { class: 'v-today-explain__label' }, 'Les 6 valeurs basses (elles tracent la ligne)'),
        h('ul', { class: 'v-today-explain__vals' }, arr(t.referenceDays).map((iso) => valueChip(iso)))) : null,
      high.length ? h('div', { class: 'v-today-explain__group' },
        h('p', { class: 'v-today-explain__label' }, 'Valeurs hautes comptées'),
        h('ol', { class: 'v-today-explain__vals' }, high.map((iso, i) => valueChip(iso, String(i + 1))))) : null,
      arr(t.ignoredDays).length ? note(sentence(`Valeur retombée, non comptée (exception 2) : ${arr(t.ignoredDays).map(dayLabel).join(', ')}`)) : null,
      arr(t.excludedDays).length ? note(sentence(`${plural(arr(t.excludedDays).length, 'Valeur exclue', 'Valeurs exclues')} (perturbation notée) : ${arr(t.excludedDays).map(dayLabel).join(', ')}`)) : null,
      arr(t.refusedExclusions).length ? note(sentence(`**Exclusion refusée**, la valeur est gardée (elle aurait contourné l'exception 2) : ${arr(t.refusedExclusions).map(dayLabel).join(', ')}`)) : null,
      t.gapsInWindow > 0 ? note(`${t.gapsInWindow} ${plural(t.gapsInWindow, 'jour')} sans mesure dans la fenêtre d'évaluation.`) : null,
      t.borderline ? note('**Cas limite** : la montée est tout juste suffisante après arrondi. Attendre 1 à 2 jours de plus est prudent.') : null,
      t.lhDoubt ? note('Un test LH positif après la montée rend l\'évaluation douteuse : attends de nouvelles valeurs.') : null,
      t.expected ? note(`**Il manque** : ${t.expected}`) : null,
      note(t.explanation),
      note('Les valeurs affichées sont celles que tu as saisies ; le calcul les arrondit au 0,05 °C le plus proche.', 'muted'),
    ]
    parts.push(explainSection('Température', 'thermo', ...tempChildren))

    const s = cycle.sign ?? {}
    const isCol = s.kind === 'col'
    parts.push(explainSection(isCol ? 'Col de l\'utérus' : 'Glaire', isCol ? 'eye' : 'drop',
      facts([
        ['État', SIGN_STATE_LABEL[s.state] ?? '—'],
        ['Jour sommet (P)', s.peakDay ? `${dayLabel(s.peakDay)}${!isCol && PEAK_CODE[s.peakValue] ? ` (${PEAK_CODE[s.peakValue]})` : ''}` : null],
        ['P+3', s.criterionDay ? `${dayLabel(s.criterionDay)}, le soir` : null],
      ]),
      s.lowQualityPeak ? note('Le sommet porte sur une glaire **humide (f)** seulement : il est moins net.') : null,
      note(s.explanation),
    ))

    const d = cycle.double ?? {}
    parts.push(explainSection('Double contrôle', 'lock',
      facts([
        ['État', d.state === 'confirme' ? 'Confirmé' : 'Pas encore confirmé'],
        ['Infertile à partir du', d.infertileFrom ? `${fmtDate(d.infertileFrom, 'long')} à 18 h, jusqu'aux prochaines règles` : null],
      ]),
      note('La phase infertile commence le soir du jour où **les deux critères** (température et signe) sont remplis, en prenant le plus tardif.', 'muted'),
      note(d.explanation),
    ))

    const p = cycle.pre ?? {}
    parts.push(explainSection('Début de cycle', 'calendar',
      facts([
        ['Jours infertiles possibles (D)', Number.isInteger(p.D) ? String(p.D) : null],
        ['Règle', PRE_RULE_LABEL[p.rule]
          ? `${capitalize(PRE_RULE_LABEL[p.rule])}${p.rule === 'moins_8' && Number.isInteger(p.earliestFhmDay) ? ` (1re valeur haute la plus précoce : J${p.earliestFhmDay})` : ''}`
          : null],
        ['Dernier jour infertile', p.lastInfertileDay ? dayLabel(p.lastInfertileDay) : null],
      ]),
      p.blockedReason ? note(`**Pourquoi aucun jour** : ${p.blockedReason}`) : null,
      note('Dès qu\'une glaire apparaît, ou qu\'un jour n\'est pas observé, le début de cycle redevient fertile.', 'muted'),
    ))

    const f = cycle.flags ?? {}
    const modes = [
      f.learning ? 'Cycle d\'apprentissage : la protection reste recommandée tous les jours.' : null,
      f.strictFSRH ? 'Mode strict FSRH : protection tous les jours jusqu\'à ce que 3 cycles après le retrait soient passés et que tes cycles soient classés réguliers (au moins 6 cycles complets valides).' : null,
      f.postHormonal ? 'Après une contraception hormonale : une valeur haute de plus est exigée.' : null,
      f.emergencyContraception ? `Contraception d'urgence le ${fmtDate(f.emergencyContraception, 'long')} : tout est fertile jusqu'aux prochaines règles.` : null,
      f.unevaluable ? `Cycle non évaluable${f.unevaluableFrom ? ` depuis le ${fmtDate(f.unevaluableFrom, 'long')}` : ''}${f.unevaluableReason ? ` : ${f.unevaluableReason}` : ''}.` : null,
      f.atypical ? 'Cycle atypique : il ne sert pas aux prévisions.' : null,
      current.isCycle0 ? 'Cycle 0 : protection jusqu\'à tes premières règles, l\'évaluation est affichée pour apprendre.' : null,
    ].filter(Boolean)
    if (modes.length) {
      parts.push(explainSection('Modes actifs', 'book', h('ul', { class: 'v-today-explain__list' }, modes.map((m) => h('li', {}, m)))))
    }

    const warnings = arr(cycle.warnings)
    if (warnings.length) {
      parts.push(explainSection('À vérifier', 'alert',
        h('ul', { class: 'v-today-explain__list' }, warnings.map((w) => h('li', {}, richText(w))))))
    }
  }

  parts.push(h('button', { type: 'button', class: 'btn btn--block', on: { click: openArticle } },
    icon('book'), 'Lire : comment l\'app décide'))

  return h('div', { class: ['v-today', 'v-today-explain', 'stack'] }, parts)
}

/* ---------- 3. À noter aujourd'hui ---------- */

/**
 * Série de matins mesurés : jours consécutifs avec une température saisie, jusqu'à aujourd'hui
 * (ou jusqu'à hier si aujourd'hui n'est pas encore noté). Fonction pure.
 * @param {object} days AppData.days
 * @param {string} today
 * @returns {number}
 */
export function measureStreak(days, today) {
  const has = (iso) => isTemp(days?.[iso]?.temp)
  let iso = has(today) ? today : addDays(today, -1)
  let n = 0
  while (iso && has(iso) && n < 3660) {
    n++
    iso = addDays(iso, -1)
  }
  return n
}

function streakPill(ctx) {
  const today = ctx.now.today
  const n = measureStreak(ctx.data?.days, today)
  if (n < 2) return null
  const doneToday = isTemp(ctx.data?.days?.[today]?.temp)
  return h('div', { class: 'v-today-streak' },
    h('p', { class: 'v-today-streak__pill' },
      h('span', { class: 'v-today-streak__star' }, icon('star', { size: 16 })),
      h('span', {}, 'Série : ', h('strong', {}, `${n} ${plural(n, 'matin')}`), ' de mesure')),
    h('p', { class: 'v-today-streak__note' }, doneToday
      ? 'Belle régularité : chaque matin affine ta courbe.'
      : 'Ta mesure de ce matin la prolongera.'))
}

function todoCard(ctx, current, cycle) {
  const { now, data } = ctx
  const day = data?.days?.[now.today] ?? {}
  const todo = current.todo ?? {}
  const kind = cycle?.sign?.kind ?? data?.profile?.secondarySign ?? 'glaire'

  let tempValue = null
  if (isTemp(day.temp)) tempValue = `${fmtTemp(day.temp)}${day.tempExcluded ? ' (exclusion demandée)' : ''}`
  else if (arr(day.tempDisturbances).length) tempValue = 'Perturbation notée'

  let signValue = null
  if (kind === 'col') {
    signValue = [labelOf(CERVIX_OPENING, day.cervixOpening), labelOf(CERVIX_FIRMNESS, day.cervixFirmness)].filter(Boolean).join(' · ') || null
  } else {
    signValue = [labelOf(MUCUS_SENSATIONS, day.mucusSensation), labelOf(MUCUS_ASPECTS, day.mucusAspect)].filter(Boolean).join(' · ') || null
    if (signValue && day.mucusDoubtful) signValue += ' (douteuse)'
  }

  const items = [
    { id: 'temp', icon: 'thermo', label: 'Température au réveil', missing: todo.temp ?? !tempValue, value: tempValue },
    { id: 'sign', icon: kind === 'col' ? 'eye' : 'drop', label: kind === 'col' ? 'Col de l\'utérus' : 'Glaire', missing: todo.sign ?? !signValue, value: signValue },
  ]
  if (todo.bleeding || day.bleeding) {
    items.push({
      id: 'bleeding',
      icon: 'drop',
      label: 'Saignements',
      missing: !!todo.bleeding,
      value: labelOf(BLEEDING_LEVELS, day.bleeding),
      hint: 'Précise : règles, spotting ou rien.',
    })
  }
  const done = items.filter((it) => !it.missing).length
  const allDone = done === items.length
  const goNote = () => ctx.navigate('noter', { date: now.today })

  return section('v-today-todo',
    h('div', { class: 'v-today-todo__head' },
      h('div', { class: 'v-today-todo__titles' },
        h('h2', { class: 'section-title' }, 'À noter aujourd\'hui'),
        h('p', { class: 'v-today-todo__lead' }, allDone
          ? 'Tout est noté pour aujourd\'hui. Bravo !'
          : `Encore ${items.length - done} ${plural(items.length - done, 'observation')} : une minute suffit.`)),
      h('span', {
        class: ['v-today-todo__count', allDone && 'is-done'],
        role: 'img',
        ariaLabel: `${done} sur ${items.length} ${plural(items.length, 'observation')} ${plural(done, 'notée', 'notées')}`,
      }, allDone ? icon('check', { size: 16 }) : null, `${done}/${items.length}`)),
    h('div', { class: 'v-today-todo__bar', ariaHidden: 'true' },
      h('span', { class: 'v-today-todo__fill', style: { width: `${Math.round((done / items.length) * 100)}%` } })),
    streakPill(ctx),
    h('ul', { class: 'v-today-todo__list' }, items.map((it) => h('li', {},
      h('button', {
        type: 'button',
        class: ['v-today-todo__item', it.missing ? 'is-todo' : 'is-done'],
        on: { click: goNote },
      },
      h('span', { class: 'v-today-todo__icon' }, icon(it.icon, { size: 20 })),
      h('span', { class: 'v-today-todo__text' },
        h('span', { class: 'v-today-todo__label' }, it.label),
        h('span', { class: ['v-today-todo__value', it.value && 'mono'] },
          it.value ?? (it.missing ? (it.hint ?? 'Pas encore noté') : 'Rien à noter'))),
      h('span', { class: 'v-today-todo__state' },
        it.missing ? null : h('span', { class: 'v-today-todo__check' }, icon('check', { size: 14 })),
        it.missing ? 'À faire' : 'Fait'))))),
    h('button', {
      type: 'button',
      class: 'btn btn--primary btn--block',
      on: { click: goNote },
    }, icon(allDone ? 'edit' : 'plus'), allDone ? 'Compléter aujourd\'hui' : 'Noter aujourd\'hui'),
    arr(current.nextSteps).length ? h('div', { class: 'v-today-todo__next' },
      h('h3', { class: 'v-today-todo__next-title' }, 'Prochaines étapes'),
      h('ul', {}, arr(current.nextSteps).map((s) => h('li', {}, richText(s))))) : null,
  )
}

/* ---------- 4. Bande de 7 jours ---------- */

/** Libellé complet (aria-label, title) d'une cellule passée ou du jour. Couleur = décision (S1). */
function pastCellLabel(s, look, isToday) {
  const meta = STATE_META[s.state] ?? STATE_META.INDETERMINE
  const period = arr(s.overlays).some((o) => o === 'regles')
  let base = meta.label
  if (s.state === 'FERTILE_JUSQU_A_18H') {
    if (look.held) base = 'Fertile (bascule de 18 h non appliquée : protection nécessaire)'
    else if (!isToday) base = 'Fertile jusqu\'à 18 h, puis infertile (double contrôle)'
  } else if (look.held) {
    // État des règles infertile, décision « protection » : l'état n'apparaît que dans le libellé.
    const causes = arr(s.overlays).filter((o) => OVERRIDE_CAUSES[o]).map((o) => OVERRIDE_CAUSES[o])
    base = `Infertile selon les règles — protection recommandée : ${causes.length ? causes.join(' et ') : 'décision prudente'}`
  }
  return `${base}${period ? ', règles' : ''}`
}

/** Abréviation sous la pastille : elle suit la décision (jamais « inf. » sur un jour protégé). */
function cellAbbr(s, look) {
  if (look.kind === 'mixed') return STATE_ABBR.FERTILE_JUSQU_A_18H
  if (look.kind === 'protect') return look.held ? 'prot.' : (STATE_ABBR[s.state] ?? 'prot.')
  return STATE_ABBR[s.state] ?? 'inf.'
}

function weekStrip(ctx, current, cycle) {
  const { analysis, now } = ctx
  const future = analysis.predictions?.futureDays ?? {}
  const holdInfertile = !!(cycle?.flags?.learning || cycle?.flags?.strictFSRH || current.isCycle0)

  const cells = []
  for (let offset = -3; offset <= 3; offset++) {
    const iso = addDays(now.today, offset)
    const [weekday, dayNum] = fmtDate(iso, 'jour').split(/\s/)
    const isToday = offset === 0
    const head = [
      h('span', { class: 'v-today-week__wd' }, isToday ? 'auj.' : weekday),
      h('span', { class: 'v-today-week__dn' }, dayNum),
    ]

    if (offset <= 0) {
      const s = analysis.days?.[iso] ?? null
      const look = s ? decisionLook(s) : null
      const label = s ? pastCellLabel(s, look, isToday) : 'pas de données'
      const period = !!(s && arr(s.overlays).some((o) => o === 'regles'))
      cells.push(h('li', { class: 'v-today-week__item' },
        h('button', {
          type: 'button',
          class: ['v-today-week__cell', s ? `v-today-week__cell--${look.kind}` : 'v-today-week__cell--none', isToday && 'is-today today-ring'],
          ariaLabel: `${capitalize(fmtDate(iso, 'long'))}${isToday ? ' (aujourd\'hui)' : ''} : ${label}. Noter ce jour.`,
          title: label,
          attrs: isToday ? { 'aria-current': 'date' } : {},
          dataset: s ? { decision: look.protect ? 'protection' : 'libre' } : {},
          on: { click: () => ctx.navigate('noter', { date: iso }) },
        },
        head,
        s
          ? h('span', { class: ['st', look.stCls, look.held && 'st--held'] }, icon(look.icon, { size: 20 }))
          : h('span', { class: 'st v-today-week__st-none' }, icon('minus', { size: 18 })),
        h('span', { class: 'v-today-week__abbr' }, s ? cellAbbr(s, look) : '—'),
        h('span', { class: ['v-today-week__mark', period && 'dawn-bar'] }))))
    } else {
      const tags = arr(future[iso])
      const tag = FUTURE_ORDER.find((t) => tags.includes(t)) ?? null
      const fm = tag ? FUTURE_META[tag] : null
      const held = tag === 'infertile_post_suite' && holdInfertile
      const fkind = held ? 'protect' : fm?.kind ?? null
      const ficon = held ? 'shield' : fm?.icon ?? 'minus'
      const period = tags.includes('regles_prevues')
      const label = fm ? `${fm.label}${held ? ', protection quand même recommandée' : ''}` : 'pas de prévision'
      cells.push(h('li', { class: 'v-today-week__item' },
        h('div', {
          class: ['v-today-week__cell', 'v-today-week__cell--future'],
          role: 'img',
          ariaLabel: `${capitalize(fmtDate(iso, 'long'))} : ${label}.`,
          title: label,
        },
        head,
        h('span', { class: ['st', 'st--future', fkind && `st--${fkind}`] }, icon(ficon, { size: 18 })),
        h('span', { class: 'v-today-week__abbr' }, fm ? 'prév.' : '—'),
        h('span', { class: ['v-today-week__mark', period && 'dawn-bar dawn-bar--forecast'] }))))
    }
  }

  return section('v-today-week',
    h('div', { class: 'v-today-week__head' },
      h('h2', { class: 'section-title' }, 'Cette semaine'),
      h('button', {
        type: 'button',
        class: 'v-today-link',
        on: { click: () => ctx.navigate('calendrier') },
      }, 'Calendrier', icon('chevron-right', { size: 16 }))),
    h('ol', { class: 'v-today-week__list' }, cells),
    h('ul', { class: 'v-today-week__legend', ariaLabel: 'Légende' },
      h('li', {}, h('span', { class: 'st st--protect st--xs' }, icon('shield', { size: 13 })), 'Protection'),
      h('li', {}, h('span', { class: 'st st--safe st--xs' }, icon('check', { size: 13 })), 'Sans protection'),
      h('li', {}, h('span', { class: 'dawn-bar v-today-week__legend-bar' }), 'Règles'),
      h('li', {}, h('span', { class: 'st st--future st--xs' }), 'Prévision')),
    h('p', { class: 'v-today-week__hint' }, 'Touche un jour passé pour le compléter.'),
  )
}

/* ---------- 5. Mini-courbe ---------- */

const CHART = { w: 360, h: 168, left: 40, right: 12, top: 18, bottom: 26 }

function miniCurve(ctx, cycle) {
  const { data, now } = ctx
  const title = h('h2', { class: 'section-title' }, 'Courbe du cycle')
  if (!cycle?.start) {
    return section('v-today-curve', title, h('p', { class: 'muted' }, 'Ta courbe apparaîtra dès 2 températures notées dans ce cycle.'))
  }
  const end = cycle.end && cycle.end < now.today ? cycle.end : now.today
  const range = dateRange(cycle.start, end)
  const excluded = new Set(arr(cycle.temp?.excludedDays))
  const highIndex = new Map(arr(cycle.temp?.highDays).map((iso, i) => [iso, i + 1]))
  const points = range
    .map((iso, i) => ({ iso, i, t: data?.days?.[iso]?.temp }))
    .filter((p) => isTemp(p.t))
    .map((p) => ({ ...p, excluded: excluded.has(p.iso) }))
  const valid = points.filter((p) => !p.excluded)

  if (points.length < 2) {
    return section('v-today-curve', title,
      h('p', { class: 'muted' }, 'Ta courbe apparaîtra dès 2 températures notées dans ce cycle.'))
  }

  const coverline = isTemp(cycle.temp?.coverline) ? cycle.temp.coverline : null
  const values = points.map((p) => p.t).concat(coverline !== null ? [coverline] : [])
  let lo = Math.floor((Math.min(...values) - 5) / 10) * 10
  let hi = Math.ceil((Math.max(...values) + 5) / 10) * 10
  while (hi - lo < 60) { lo -= 10; if (hi - lo < 60) hi += 10 }

  const slots = Math.max(range.length, 24)
  const plotW = CHART.w - CHART.left - CHART.right
  const plotH = CHART.h - CHART.top - CHART.bottom
  const x = (i) => CHART.left + (slots > 1 ? (i / (slots - 1)) * plotW : plotW / 2)
  const y = (t) => CHART.top + ((hi - t) / (hi - lo)) * plotH
  const step = hi - lo > 60 ? 20 : 10

  const grid = []
  for (let v = lo; v <= hi; v += 10) {
    const major = (v - lo) % step === 0
    grid.push(h('line', { class: ['v-today-curve__grid', major && 'is-major'], x1: CHART.left, x2: CHART.w - CHART.right, y1: y(v), y2: y(v) }))
    if (major) grid.push(h('text', { class: 'v-today-curve__axis', x: CHART.left - 6, y: y(v) + 4, textAnchor: 'end' }, fmtTempShort(v)))
  }

  const todayIdx = range.indexOf(now.today)
  const lastIdx = range.length - 1
  const parts = [
    ...grid,
    h('text', { class: 'v-today-curve__axis', x: x(0), y: CHART.h - 8, textAnchor: 'start' }, 'J1'),
    lastIdx > 3 ? h('text', { class: 'v-today-curve__axis', x: x(lastIdx), y: CHART.h - 8, textAnchor: 'middle' }, `J${lastIdx + 1}`) : null,
  ]
  if (todayIdx >= 0) {
    parts.push(
      h('line', { class: 'v-today-curve__today', x1: x(todayIdx), x2: x(todayIdx), y1: CHART.top - 6, y2: CHART.h - CHART.bottom }),
      h('text', { class: 'v-today-curve__today-label', x: x(todayIdx), y: CHART.top - 8, textAnchor: todayIdx > slots - 3 ? 'end' : 'middle' }, 'Auj.'))
  }
  if (coverline !== null) {
    parts.push(
      h('line', { class: 'v-today-curve__coverline', x1: CHART.left, x2: CHART.w - CHART.right, y1: y(coverline), y2: y(coverline) }),
      h('text', { class: 'v-today-curve__coverline-label', x: CHART.w - CHART.right, y: y(coverline) + 12, textAnchor: 'end' }, `ligne ${fmtTempShort(coverline)}`))
  }
  if (valid.length >= 2) {
    const line = valid.map((p) => `${x(p.i).toFixed(1)},${y(p.t).toFixed(1)}`)
    const base = (CHART.h - CHART.bottom).toFixed(1)
    // Aire douce sous la courbe (décor, couleur du thème).
    parts.push(h('polygon', {
      class: 'v-today-curve__area',
      points: [`${x(valid[0].i).toFixed(1)},${base}`, ...line, `${x(valid[valid.length - 1].i).toFixed(1)},${base}`].join(' '),
    }))
    parts.push(h('polyline', { class: 'v-today-curve__line', points: line.join(' ') }))
  }
  for (const p of points) {
    parts.push(h('circle', { class: ['v-today-curve__pt', p.excluded && 'is-excluded'], cx: x(p.i), cy: y(p.t), r: p.excluded ? 3.2 : 3.4 }))
    const n = highIndex.get(p.iso)
    if (n && !p.excluded) parts.push(h('text', { class: 'v-today-curve__num', x: x(p.i), y: y(p.t) - 7, textAnchor: 'middle' }, String(n)))
  }

  const last = valid[valid.length - 1] ?? points[points.length - 1]
  const summary = `Courbe de température du cycle en cours : ${points.length} ${plural(points.length, 'mesure')}`
    + `${excluded.size ? ` dont ${points.length - valid.length} ${plural(points.length - valid.length, 'exclue')}` : ''}`
    + `, dernière valeur ${fmtTemp(last.t)} le ${fmtDate(last.iso, 'long')}`
    + `${coverline !== null ? `, ligne auxiliaire ${fmtTemp(coverline)}` : ''}. Ouvrir les cycles.`

  return section('v-today-curve',
    title,
    h('button', {
      type: 'button',
      class: 'v-today-curve__btn',
      ariaLabel: summary,
      on: { click: () => ctx.navigate('cycles', Number.isInteger(cycle.index) ? { cycle: cycle.index } : {}) },
    },
    h('svg', {
      class: 'v-today-curve__svg',
      viewBox: `0 0 ${CHART.w} ${CHART.h}`,
      preserveAspectRatio: 'xMidYMid meet',
      ariaHidden: 'true',
      focusable: 'false',
    }, parts),
    h('span', { class: 'v-today-curve__more' },
      h('span', { class: 'v-today-curve__legend' },
        h('span', { class: 'v-today-curve__key v-today-curve__key--pt' }), 'mesure',
        excluded.size ? [h('span', { class: 'v-today-curve__key v-today-curve__key--excluded' }), 'exclue'] : null,
        coverline !== null ? [h('span', { class: 'v-today-curve__key v-today-curve__key--line' }), 'ligne auxiliaire'] : null),
      h('span', { class: 'v-today-curve__link' }, 'Voir la courbe complète', icon('chevron-right', { size: 18 })))),
  )
}

/* ---------- 6. Prévisions ---------- */

function predictionsCard(pred) {
  if (!pred) return null
  const rows = []
  if (pred.nextPeriod) {
    const np = pred.nextPeriod
    // Les règles sont un marqueur (barre aube, ici en pointillés car prévue), jamais une pastille (S3).
    rows.push([h('span', { class: 'v-today-pred__mk' }, h('span', { class: 'dawn-bar dawn-bar--forecast' })), 'Prochaines règles', [
      h('span', { class: 'v-today-pred__main' }, `vers le ${fmtDate(np.date, 'long')}`),
      np.from80 && np.to80
        ? h('span', { class: 'v-today-pred__range' }, `entre le ${fmtDate(np.from80, 'long')} et le ${fmtDate(np.to80, 'long')} (8 chances sur 10)`)
        : null,
    ]])
  }
  if (pred.ovulation) {
    const o = pred.ovulation
    rows.push([h('span', { class: 'st st--future st--sm' }, icon('egg', { size: 15 })), o.retrospective ? 'Ovulation (passée)' : 'Ovulation estimée', [
      h('span', { class: 'v-today-pred__main' }, `${o.retrospective ? 'probablement ' : ''}entre le ${fmtDate(o.from, 'long')} et le ${fmtDate(o.to, 'long')}`),
    ]])
  }
  if (pred.fertileWindow) {
    rows.push([h('span', { class: 'st st--future st--protect st--sm' }, icon('shield', { size: 15 })), 'Fenêtre fertile estimée', [
      h('span', { class: 'v-today-pred__main' }, `du ${fmtDate(pred.fertileWindow.from, 'long')} au ${fmtDate(pred.fertileWindow.to, 'long')}`),
      h('span', { class: 'v-today-pred__range' }, 'Repère calendaire : seules tes observations décident.'),
    ]])
  }
  const meta = []
  if (pred.confidence && CONFIDENCE_LABEL[pred.confidence]) meta.push(`Confiance : ${CONFIDENCE_LABEL[pred.confidence].toLowerCase()}`)
  if (pred.method && pred.method !== 'aucune' && Number.isInteger(pred.cyclesUsed)) {
    meta.push(pred.cyclesUsed > 0
      ? `${pred.cyclesUsed} ${plural(pred.cyclesUsed, 'cycle utilisé', 'cycles utilisés')}`
      : 'Aucun cycle personnel encore utilisé')
  }

  return h('section', { class: 'card card--forecast v-today-pred', ariaLabelledby: 'v-today-pred-title' },
    h('div', { class: 'v-today-pred__head' },
      h('span', { class: 'v-today-pred__icon' }, icon('forecast', { size: 22 })),
      h('h2', { class: 'section-title', id: 'v-today-pred-title' }, 'Prévisions'),
      h('span', { class: 'v-today-pred__tag' }, 'Indicatif')),
    h('p', { class: 'v-today-pred__label' }, pred.label || 'Estimation indicative. Ne l\'utilise pas comme contraception.'),
    pred.late && pred.late.days > 0
      ? h('p', { class: 'v-today-pred__late' }, icon('clock', { size: 18 }),
        h('span', {}, `Règles toujours absentes ${pred.late.days} ${plural(pred.late.days, 'jour')} après la fin de la fourchette estimée.`))
      : null,
    rows.length ? h('dl', { class: 'v-today-pred__rows' }, rows.map(([mk, k, v]) => h('div', { class: 'v-today-pred__row' },
      h('dt', {}, mk, h('span', {}, k)),
      h('dd', {}, v)))) : null,
    meta.length ? h('p', { class: 'v-today-pred__meta' }, meta.join(' · ')) : null,
    pred.message ? h('p', { class: 'v-today-pred__msg' }, richText(pred.message)) : null,
    h('p', { class: 'v-today-pred__note' }, 'Une prévision ne remplace jamais la décision du jour.'),
  )
}

/* ---------- 7. Alertes ---------- */

function alertsList(ctx, alerts) {
  if (!alerts.length) return null
  return h('div', { class: 'v-today-alerts stack stack--sm' }, alerts.map((a) => {
    const level = ALERT_ICON[a.level] ? a.level : 'info'
    const action = a.action && a.action.route
      ? h('div', {},
        h('button', {
          type: 'button',
          class: 'btn btn--sm v-today-alerts__action',
          on: { click: () => ctx.navigate(a.action.route, a.action.params || {}) },
        }, a.action.label || 'Voir', icon('chevron-right', { size: 16 })))
      : null
    return h('div', { class: ['alert', `alert--${level}`] },
      icon(ALERT_ICON[level], { size: 20 }),
      h('p', { class: 'alert__title' }, a.title || ''),
      a.text ? h('p', { class: 'v-today-alerts__text' }, richText(a.text)) : null,
      action)
  }))
}

/* ---------- 8. Conseil du jour ---------- */

/** « Conseil du jour · Phase lutéale » ; le nom de la phase n'est affiché que si elle est connue. */
export function tipTitle(phase) {
  const meta = phase && phase !== 'inconnue' ? PHASE_META[phase] : null
  return meta ? `Conseil du jour · ${meta.label}` : 'Conseil du jour'
}

function tipCard(ctx, current) {
  const phase = PHASE_TIPS[current.status.phase]?.length ? current.status.phase : 'inconnue'
  const tips = arr(PHASE_TIPS[phase])
  if (!tips.length) return null
  const tip = tips[((dayIndex(ctx.now.today) % tips.length) + tips.length) % tips.length]
  return section('v-today-tip',
    h('span', { class: 'v-today-tip__icon' }, icon('sparkle', { size: 22 })),
    h('div', { class: 'v-today-tip__body' },
      h('p', { class: 'eyebrow v-today-tip__eyebrow' }, tipTitle(phase)),
      h('p', { class: 'v-today-tip__text' }, richText(tip)),
      h('button', {
        type: 'button',
        class: 'v-today-link v-today-tip__more',
        on: { click: () => ctx.navigate('comprendre', { article: 'phases' }) },
      }, 'En savoir plus sur les phases', icon('chevron-right', { size: 16 }))),
  )
}

/* ---------- 9. Lien urgence ---------- */

function urgenceLink(ctx) {
  return h('button', {
    type: 'button',
    class: 'v-today-urgence',
    on: { click: () => ctx.navigate('urgence') },
  },
  // Bouée (jamais le bouclier, réservé à « protection nécessaire »).
  h('span', { class: 'v-today-urgence__icon' }, icon('buoy', { size: 22 })),
  h('span', { class: 'v-today-urgence__text' }, 'Préservatif rompu ou rapport non protégé ?'),
  icon('chevron-right', { size: 18 }))
}
