// Vue « Premier lancement » (route 'onboarding') : parcours en étapes — bienvenue,
// installation, avertissements, stérilet, 7 jours avant le retrait, mesures,
// fonctionnement des règles, départ. Contrat : ARCHITECTURE.md §3, §6.1 ;
// contenu : spec-medicale.md §1, §2.2.1, §2.5.4, §3.1-3.2, §6.3, §8.5.
//
// L'état du parcours vit en mémoire dans ce module : il survit aux re-rendus de
// main.js (et à un détour par la démo ou le parcours urgence). Rien n'est enregistré
// avant « Commencer », qui écrit le profil et les règles en une fois.

import { h, icon, fmtDate, richText, addDays, diffDays, TEMP_ROUTES, moonPath, arcPath } from '../dom.js'
import { TEXTS } from '../../content/tips.js'
import { toEpochMinutes, fromEpochMinutes } from '../../engine/dates.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
/** Date de retrait la plus ancienne acceptée (une date comme 0026-10-05 est une faute de frappe). */
export const MIN_REMOVAL_DATE = '2000-01-01'
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const IUD_CHOICES = [
  { id: 'cuivre', label: 'Au cuivre', hint: 'TT380, NT380, UT380…' },
  { id: 'hormonal', label: 'Hormonal', hint: 'Mirena, Kyleena, Jaydess, Donasert' },
  { id: 'inconnu', label: 'Je ne sais pas', recap: 'Type inconnu (règles du DIU hormonal)', hint: 'Lune appliquera les règles prévues pour un DIU hormonal, par prudence.' },
  { id: 'aucun', label: 'Pas de stérilet retiré récemment', hint: 'Tu peux quand même suivre ton cycle avec Lune.' },
]

/** Aide à l'identification (spec §3.2). */
const IUD_DEVICES = [
  { model: 'Mirena', type: 'hormonal', detail: 'Lévonorgestrel 52 mg · 8 ans · fils marron · pas d\'anneau d\'argent' },
  { model: 'Donasert', type: 'hormonal', detail: 'Lévonorgestrel 52 mg · 8 ans · fils bleus · pas d\'anneau d\'argent' },
  { model: 'Kyleena', type: 'hormonal', detail: 'Lévonorgestrel 19,5 mg · 5 ans · fils bleus · anneau d\'argent visible' },
  { model: 'Jaydess', type: 'hormonal', detail: 'Lévonorgestrel 13,5 mg · 3 ans · fils marron · anneau d\'argent (plus commercialisé depuis fin 2024)' },
  { model: 'Cuivre', type: 'cuivre', detail: 'TT380, NT380, UT380… · sans hormone · 4 à 10 ans selon le modèle · la couleur des fils ne permet pas de l\'identifier' },
]
const MODEL_SUGGESTIONS = ['Mirena', 'Kyleena', 'Jaydess', 'Donasert', 'TT380', 'NT380', 'UT380']

const RNP_CHOICES = [
  { id: 'oui', label: 'Oui' },
  { id: 'non', label: 'Non' },
  { id: 'ne_sait_pas', label: 'Je ne sais pas' },
]

const SIGN_CHOICES = [
  { id: 'glaire', label: 'La glaire cervicale', hint: 'Sensation à la vulve et aspect, notés chaque jour.', recommended: true, recommendedLabel: 'Recommandée' },
  { id: 'col', label: 'Le col de l\'utérus', hint: 'Ouverture et fermeté, une observation par jour, toujours dans la même position. Jamais seul : toujours avec la température.' },
]

/** État du parcours (null = à initialiser depuis le profil). */
let state = null
/** Dernier montage : racine et contexte fournis par main.js. */
let mounted = null

/* ------------------------------------------------------------------ */
/* Calculs (purs)                                                      */
/* ------------------------------------------------------------------ */

/**
 * Évalue un rapport non protégé (RNP) déclaré dans les 7 jours avant le retrait du DIU
 * (spec §3.1.4, §6.3). L'heure du rapport n'étant pas connue, les délais partent de 00:00
 * du jour déclaré : la date limite affichée n'est ainsi jamais trop tardive.
 *
 * @param {{ rnpDate: string, removalDate: string, removalTime?: string|null, now: { today: string, time: string } }} input
 * @returns {{
 *   removal: 'avant'|'apres'|'aujourdhui',
 *   hoursSince: number,
 *   levonorgestrel: { open: boolean, until: { date: string, time: string } },
 *   ulipristal: { open: boolean, until: { date: string, time: string } },
 *   safeRemovalFrom: string,
 *   testDate: string,
 * }}
 */
export function assessRnp({ rnpDate, removalDate, removalTime = null, now }) {
  const start = toEpochMinutes(rnpDate, '00:00')
  const nowMin = toEpochMinutes(now.today, TIME_RE.test(now.time || '') ? now.time : '00:00')
  const hoursSince = (nowMin - start) / 60
  const deadline = (hours) => ({ open: hoursSince < hours, until: fromEpochMinutes(start + hours * 60) })
  return {
    removal: removalStatus(removalDate, removalTime, now),
    hoursSince,
    levonorgestrel: deadline(72),
    ulipristal: deadline(120),
    // Fenêtre interrogée : du retrait − 7 j à 00:00 jusqu'au retrait. Un retrait au plus tôt
    // à RNP + 8 jours sort ce rapport de la fenêtre (ex. RNP le 3 → retrait le 11 au plus tôt).
    safeRemovalFrom: addDays(rnpDate, 8),
    testDate: addDays(rnpDate, 21),
  }
}

/**
 * Le retrait a-t-il déjà eu lieu ?
 * @param {string} removalDate
 * @param {string|null} removalTime
 * @param {{ today: string, time: string }} now
 * @returns {'avant'|'apres'|'aujourdhui'} 'aujourdhui' = aujourd'hui, heure inconnue
 */
function removalStatus(removalDate, removalTime, now) {
  if (removalDate > now.today) return 'avant'
  if (removalDate < now.today) return 'apres'
  if (!TIME_RE.test(removalTime || '')) return 'aujourdhui'
  return removalTime <= now.time ? 'apres' : 'avant'
}

/**
 * « jusqu'à la fin du lundi 5 octobre », « jusqu'à ce soir minuit » (si c'est aujourd'hui)
 * ou « jusqu'au lundi 5 octobre à 23 h 00 ».
 */
function fmtDeadline({ date, time }, today) {
  if (time === '00:00') {
    const lastDay = addDays(date, -1)
    return lastDay === today ? 'jusqu\'à ce soir minuit' : `jusqu'à la fin du ${fmtDate(lastDay)}`
  }
  return `jusqu'${date === today ? 'à aujourd\'hui' : `au ${fmtDate(date)}`} à ${time.replace(':', ' h ')}`
}

/** Date proposée si le champ est vide : aujourd'hui (l'utilisatrice la corrige si besoin). */
function defaultRemovalDate(today) {
  return today
}

function isValidIso(iso) {
  return ISO_RE.test(iso || '') && addDays(iso, 0) === iso
}

function yearOf(iso) {
  return Number(String(iso).slice(0, 4))
}

/* ------------------------------------------------------------------ */
/* État                                                                */
/* ------------------------------------------------------------------ */

function initState(ctx) {
  const p = ctx.data?.profile || {}
  const r = ctx.data?.rules || {}
  const today = ctx.now?.today
  return {
    step: 'bienvenue',
    disclaimer: !!p.disclaimerAcceptedAt,
    iudChoice: p.iudType || (p.onboardingDone ? 'aucun' : null),
    iudModel: p.iudModel || '',
    removalDate: p.iudRemovalDate || defaultRemovalDate(today),
    removalTime: p.iudRemovalTime || '',
    rnp: p.rnpBeforeRemoval || null,
    rnpDate: p.rnpBeforeRemovalDate || '',
    tempRoute: p.tempRoute || 'buccale',
    secondarySign: p.secondarySign || 'glaire',
    wakeTime: p.usualWakeTime || '',
    // null = non touché : précoché selon le type de DIU (hormonal / inconnu).
    strictFSRH: p.onboardingDone ? r.strictFSRH === true : null,
    birthYear: p.birthYear ? String(p.birthYear) : '',
    error: null,
  }
}

const hasIud = () => ['cuivre', 'hormonal', 'inconnu'].includes(state.iudChoice)
const hormonalRules = () => state.iudChoice === 'hormonal' || state.iudChoice === 'inconnu'
const strictChecked = () => (state.strictFSRH === null ? hormonalRules() : state.strictFSRH)

/** Début de la fenêtre des 7 jours (spec §3.1.3). */
const windowStart = () => addDays(state.removalDate, -7)

/* ------------------------------------------------------------------ */
/* Briques d'interface                                                 */
/* ------------------------------------------------------------------ */

function para(text, cls) {
  return h('p', { class: cls }, richText(text))
}

/** Point illustré : icône (pastille colorée selon l'icône) + titre + texte. */
function point(iconName, title, text) {
  return h('li', { class: 'v-onb__point' },
    h('span', { class: ['v-onb__point-icon', `v-onb__point-icon--${iconName}`] }, icon(iconName, { size: 22 })),
    h('div', { class: 'v-onb__point-body' },
      h('p', { class: 'v-onb__point-title' }, title),
      text ? para(text, 'v-onb__point-text') : null))
}

/* ------------------------------------------------------------------ */
/* Petit ciel illustratif de l'en-tête (décor, aria-hidden)            */
/* ------------------------------------------------------------------ */

const SKY_W = 343
const SKY_H = 110
const SKY_HORIZON = 89.9 // 81,7 % de la hauteur : aligné sur l'horizon du dégradé --sky
const SKY_R = 66
const SKY_PHASES = ['regles', 'folliculaire', 'ovulatoire', 'luteale']
const SKY_STARS = [[22, 20, 1.2], [58, 44, 0.9], [96, 14, 1], [128, 52, 0.8], [214, 12, 1.1], [246, 40, 0.8], [286, 22, 1.3], [320, 50, 0.9], [306, 74, 0.7], [40, 70, 0.7]]
const r2 = (n) => Math.round(n * 100) / 100

/**
 * Ciel de l'étape : arc de cycle (jours passés pleins, à venir en pointillés) et lune qui
 * avance d'une étape à l'autre. Étape 1 : une grande pleine lune qui se lève sur l'horizon.
 * @param {number} pos  rang de l'étape (1…n)
 * @param {number} n    nombre d'étapes
 * @param {string} stepId
 */
function stepSky(pos, n, stepId) {
  const cx = SKY_W / 2
  const first = pos <= 1
  const t = n > 1 ? (pos - 1) / (n - 1) : 0
  const ang = (x) => Math.PI - x * Math.PI
  const at = 0.06 + t * 0.88 // position de la lune sur l'arc
  const segs = SKY_PHASES.map((phase, i) => {
    const a0 = ang(i / 4) - (i ? 0.02 : 0)
    const a1 = ang((i + 1) / 4) + (i < 3 ? 0.02 : 0)
    const parts = []
    const from = i / 4
    const to = (i + 1) / 4
    if (first || at <= from) parts.push([a0, a1, true])
    else if (at >= to) parts.push([a0, a1, false])
    else {
      parts.push([a0, ang(at), false])
      parts.push([ang(at), a1, true])
    }
    return parts.map(([b0, b1, future]) => h('path', {
      class: ['v-onb__sky-seg', `v-onb__sky-seg--${phase}`, future && 'v-onb__sky-seg--future'],
      d: arcPath(cx, SKY_HORIZON, SKY_R, b0, b1),
    }))
  })
  let moon
  if (first) {
    const r = 30
    const cy = SKY_HORIZON - 10
    moon = h('g', { class: 'v-onb__moon v-onb__moon--rise' },
      h('circle', { class: 'moon__halo', cx, cy, r: r * 1.9 }),
      h('circle', { class: 'moon__halo', cx, cy, r: r * 1.35 }),
      h('circle', { class: 'moon__dark', cx, cy, r }),
      h('path', { class: 'moon__lit', d: moonPath(cx, cy, r, 0.5) }))
  } else {
    const r = 13
    const mx = r2(cx + SKY_R * Math.cos(ang(at)))
    const my = r2(SKY_HORIZON - SKY_R * Math.sin(ang(at)))
    const f = 0.12 + t * 0.76 // la lune change de forme au fil des étapes
    moon = h('g', { class: 'v-onb__moon' },
      h('circle', { class: 'moon__halo', cx: mx, cy: my, r: r * 1.9 }),
      h('circle', { class: 'moon__dark', cx: mx, cy: my, r }),
      h('path', { class: 'moon__lit', d: moonPath(mx, my, r, f) }))
  }
  return h('div', { class: 'sky v-onb__sky', dataset: { step: stepId }, ariaHidden: 'true' },
    h('svg', {
      class: 'v-onb__sky-svg',
      viewBox: `0 0 ${SKY_W} ${SKY_H}`,
      width: '100%',
      preserveAspectRatio: 'xMidYMid meet',
      focusable: 'false',
      ariaHidden: 'true',
    },
    h('g', {}, SKY_STARS.map(([x, y, rr], i) => h('circle', { class: ['v-onb__star', i % 3 === 0 && 'v-onb__star--twinkle'], cx: x, cy: y, r: rr }))),
    h('path', { class: 'v-onb__sky-under', d: arcPath(cx, SKY_HORIZON, SKY_R, Math.PI, 0) }),
    segs,
    moon,
    // La mer cache le bas de la lune qui se lève.
    h('rect', { class: 'v-onb__sea', x: 0, y: SKY_HORIZON, width: SKY_W, height: SKY_H - SKY_HORIZON }),
    h('line', { class: 'v-onb__horizon', x1: 0, y1: SKY_HORIZON, x2: SKY_W, y2: SKY_HORIZON })))
}

function bullets(items, cls = 'v-onb__list') {
  return h('ul', { class: cls }, (items || []).map((t) => h('li', {}, richText(t))))
}

function alertBox(tone, iconName, title, ...content) {
  return h('div', { class: `alert alert--${tone}`, role: tone === 'urgent' ? 'alert' : null },
    icon(iconName, { size: 20 }),
    h('div', { class: 'stack stack--sm' },
      title ? h('p', { class: 'alert__title' }, title) : null,
      ...content))
}

/**
 * Groupe de choix exclusifs (boutons à bascule, aria-pressed).
 * @param {{ id: string, legend: string, hint?: string, options: Array<{id,label,hint?,recommended?}>, value: string|null, onPick: (id: string) => void, variant?: 'seg'|'cards' }} o
 */
function choiceGroup({ id, legend, hint, options, value, onPick, variant = 'cards' }) {
  const legendId = `${id}-legende`
  const hintId = hint ? `${id}-aide` : null
  const seg = variant === 'seg'
  const buttons = options.map((opt) => {
    const on = value === opt.id
    return h('button', {
      type: 'button',
      id: `${id}-${opt.id}`,
      class: seg ? ['seg__opt', on && 'is-on'] : ['v-onb__choice', on && 'is-on'],
      ariaPressed: on ? 'true' : 'false',
      on: { click: () => onPick(opt.id) },
    },
    seg ? opt.label : [
      h('span', { class: 'v-onb__choice-mark', attrs: { 'aria-hidden': 'true' } }, on ? icon('check', { size: 16 }) : null),
      h('span', { class: 'v-onb__choice-text' },
        h('span', { class: 'v-onb__choice-label' }, opt.label,
          opt.recommended ? h('span', { class: 'badge badge--brand v-onb__reco' }, opt.recommendedLabel || 'Recommandé') : null),
        opt.hint ? h('span', { class: 'v-onb__choice-hint' }, opt.hint) : null),
    ])
  })
  return h('div', { class: 'field' },
    h('p', { class: 'label', id: legendId }, legend),
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
    h('div', {
      class: seg ? 'seg' : 'v-onb__choices',
      role: 'group',
      attrs: { 'aria-labelledby': legendId, 'aria-describedby': hintId },
    }, buttons))
}

/** Champ texte / date / heure avec libellé lié et aide éventuelle. */
function inputField({ id, label, hint, type = 'text', value, attrs = {}, onInput, onChange, inputmode, optional }) {
  const hintId = hint ? `${id}-aide` : null
  const invalid = state.error?.focusId === id
  return h('div', { class: 'field' },
    h('label', { class: 'label', htmlFor: id }, label, optional ? h('span', { class: 'v-onb__optional' }, ' (facultatif)') : null),
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
    h('input', {
      id,
      type,
      class: ['input', type !== 'text' && 'v-onb__input-short'],
      value: value || '',
      attrs: { 'aria-describedby': hintId, 'aria-invalid': invalid ? 'true' : null, inputmode, autocomplete: 'off', ...attrs },
      on: { input: (e) => onInput?.(e.target.value), change: (e) => onChange?.(e.target.value) },
    }))
}

/* ------------------------------------------------------------------ */
/* Étapes                                                              */
/* ------------------------------------------------------------------ */

function stepWelcome() {
  return h('div', { class: 'stack' },
    para('Lune t\'accompagne après le retrait de ton stérilet. Voici, honnêtement, ce qu\'elle fait.', 'v-onb__lead'),
    h('ul', { class: 'v-onb__points' },
      point('edit', 'Un carnet pour tes observations',
        'Température au réveil, glaire ou col, saignements, symptômes, rapports et tests : tout au même endroit, jour après jour.'),
      point('thermo', 'Les règles du double contrôle, appliquées pour toi',
        'Inspirées de la méthode Sensiplan, elles te disent chaque jour si une protection est nécessaire, et pourquoi. Lune n\'est **pas un dispositif médical** et son algorithme n\'a été validé par aucune étude.'),
      point('shield', 'Des premiers cycles très protégés',
        'Après le retrait, il faudra protéger **la plupart des jours** : un jour reste fertile tant que tes mesures n\'ont pas prouvé le contraire. Plus tes observations sont complètes, plus Lune pourra en identifier ensuite.')),
    h('div', { class: 'card card--flat v-onb__local' },
      icon('lock', { size: 22 }),
      h('div', {},
        h('p', { class: 'v-onb__point-title' }, 'Toutes tes données restent sur ce téléphone'),
        h('p', { class: 'hint' }, 'Aucun compte, aucune analytique, aucun envoi. En contrepartie, toi seule peux les sauvegarder : pense à exporter régulièrement.'))),
    h('p', { class: 'hint' }, 'Le parcours prend environ 5 minutes. Tu peux revenir en arrière à tout moment.'))
}

function iosSteps() {
  return h('ol', { class: 'v-onb__steps' },
    h('li', {}, 'Ouvre cette page dans le navigateur que tu garderas (Safari, ou Chrome, Edge, Firefox depuis iOS 16.4).'),
    h('li', {}, 'Touche le bouton ', h('strong', {}, 'Partager '), icon('share', { size: 18, label: 'Partager' }), ' (en bas de l\'écran, en haut sur iPad).'),
    h('li', {}, 'Choisis ', h('strong', {}, '« Sur l\'écran d\'accueil »'), ' (fais défiler la liste si besoin), puis ', h('strong', {}, '« Ajouter »'), '.'),
    h('li', {}, 'Ouvre Lune depuis sa nouvelle icône : le premier lancement reprendra là-bas.'))
}

function androidSteps() {
  return h('ol', { class: 'v-onb__steps' },
    h('li', {}, 'Dans Chrome, ouvre le menu ', h('strong', {}, '⋮'), ' en haut à droite.'),
    h('li', {}, 'Touche ', h('strong', {}, '« Installer l\'application »'), ' (ou « Ajouter à l\'écran d\'accueil »), puis confirme.'),
    h('li', {}, 'Ouvre Lune depuis sa nouvelle icône : le premier lancement reprendra là-bas.'))
}

function stepInstall(ctx) {
  const platform = ctx.env?.platform
  const ios = h('section', { class: 'card stack stack--sm' },
    h('h2', { class: 'section-title' }, 'Sur iPhone ou iPad'), iosSteps())
  const android = h('section', { class: 'card stack stack--sm' },
    h('h2', { class: 'section-title' }, 'Sur Android'), androidSteps())
  const ordered = platform === 'android' ? [android, ios] : [ios, android]
  return h('div', { class: 'stack' },
    para('Installe Lune sur ton écran d\'accueil **avant de saisir quoi que ce soit**.', 'v-onb__lead'),
    alertBox('attention', 'alert', 'Pourquoi avant ?',
      para('L\'app installée garde ses données à part du navigateur. Si tu commences ici puis installes Lune, tes saisies resteront dans le navigateur et l\'app installée démarrera vide.'),
      para('Utilise **un seul navigateur** : deux installations depuis deux navigateurs différents ne partagent pas leurs données.')),
    platform === 'autre'
      ? h('p', { class: 'hint' }, 'Sur ordinateur, Chrome et Edge proposent une icône d\'installation dans la barre d\'adresse. Lune est surtout pensée pour ton téléphone.')
      : null,
    ...ordered,
    h('p', { class: 'hint' }, 'Si tu supprimes l\'icône, considère que tes données sont effacées : exporte une sauvegarde régulièrement depuis Réglages.'),
    h('p', { class: 'hint' }, 'Déjà installée ? Ferme cette page et ouvre Lune depuis son icône. Sinon, tu peux continuer ici.'))
}

function stepDisclaimer() {
  const eff = TEXTS?.effectiveness
  const table = eff?.head && eff?.rows
    ? h('div', { class: 'v-onb__table-wrap', tabIndex: 0, role: 'region', ariaLabel: 'Tableau d\'efficacité des méthodes' },
      h('table', { class: 'v-onb__table' },
        h('caption', { class: 'sr-only' }, 'Efficacité réelle des méthodes de contraception'),
        h('thead', {}, h('tr', {}, eff.head.map((c) => h('th', { attrs: { scope: 'col' } }, c)))),
        h('tbody', {}, eff.rows.map((row) => h('tr', {},
          row.map((c, i) => (i === 0 ? h('th', { attrs: { scope: 'row' } }, c) : h('td', { class: i === 1 ? 'mono' : null }, c))))))))
    : null
  const checked = state.disclaimer
  return h('div', { class: 'stack' },
    h('div', { class: 'stack stack--sm v-onb__prose' }, (TEXTS?.disclaimerLong || []).map((t) => para(t))),
    h('section', { class: 'stack stack--sm' },
      h('h2', { class: 'section-title' }, 'Efficacité réelle'),
      table,
      bullets([
        'Ces chiffres viennent de femmes **formées** à la méthode. L\'étude de 2007 a exclu celles qui sortaient d\'une contraception hormonale : ils ne sont **pas démontrés** pour les premiers cycles après un arrêt hormonal.',
        'La phase fertile durait en médiane environ 13 jours par cycle.',
        'Les taux « typiques » des méthodes d\'observation sous-estiment probablement la réalité.',
      ], 'v-onb__list v-onb__list--small')),
    h('label', { class: ['v-onb__check', checked && 'is-on'], htmlFor: 'onb-disclaimer' },
      h('input', {
        type: 'checkbox',
        id: 'onb-disclaimer',
        checked,
        attrs: { 'aria-invalid': state.error?.focusId === 'onb-disclaimer' ? 'true' : null },
        on: { change: (e) => { state.disclaimer = e.target.checked; state.error = null; refresh() } },
      }),
      h('span', {}, 'J\'ai compris que Lune n\'est pas un dispositif médical.')))
}

function identificationHelp() {
  return h('details', { class: 'card card--flat v-onb__details' },
    h('summary', { class: 'v-onb__summary' }, icon('help', { size: 20 }), 'Comment savoir quel stérilet j\'ai ?'),
    h('div', { class: 'stack stack--sm v-onb__details-body' },
      h('p', { class: 'hint' }, 'La carte patiente, dans la boîte du dispositif, indique son nom et la date de pose. Tu peux aussi demander à la professionnelle le jour du retrait.'),
      h('ul', { class: 'v-onb__devices' }, IUD_DEVICES.map((d) => h('li', { class: 'v-onb__device' },
        h('div', { class: 'v-onb__device-text' },
          h('p', { class: 'v-onb__device-name' }, d.model === 'Cuivre' ? 'DIU au cuivre' : d.model,
            h('span', { class: `badge ${d.type === 'cuivre' ? 'badge--unknown' : 'badge--brand'}` },
              icon(d.type === 'cuivre' ? 'leaf' : 'pill', { size: 14 }), d.type === 'cuivre' ? 'Cuivre' : 'Hormonal')),
          h('p', { class: 'hint' }, d.detail)),
        h('button', {
          type: 'button',
          class: 'btn btn--sm btn--ghost',
          id: `onb-device-${d.model.toLowerCase()}`,
          ariaLabel: `C'est le mien : ${d.model === 'Cuivre' ? 'DIU au cuivre' : d.model}`,
          on: {
            click: () => {
              state.iudChoice = d.type
              if (d.model !== 'Cuivre') state.iudModel = d.model
              state.error = null
              refresh({ focusId: `onb-iud-${d.type}` })
            },
          },
        }, 'C\'est le mien'))))))
}

function removalMessage() {
  const copper = state.iudChoice === 'cuivre'
  const common = TEXTS?.removalCommon || []
  const specific = copper ? TEXTS?.removalCopper : TEXTS?.removalHormonal
  return h('section', { class: 'stack stack--sm' },
    h('h2', { class: 'section-title' }, copper ? 'Après un DIU au cuivre' : 'Après un DIU hormonal'),
    state.iudChoice === 'inconnu'
      ? alertBox('info', 'info', null, para('Type inconnu : Lune applique les règles prévues pour un DIU hormonal, plus prudentes. Tu pourras corriger dans Réglages.'))
      : null,
    alertBox('attention', 'shield', 'Protection nécessaire dès le jour du retrait',
      bullets([common[0], common[1], common[4]].filter(Boolean))),
    bullets(specific))
}

function stepIud(ctx) {
  const today = ctx.now?.today
  return h('div', { class: 'stack' },
    choiceGroup({
      id: 'onb-iud',
      legend: 'Quel stérilet te fais-tu retirer ?',
      options: IUD_CHOICES,
      value: state.iudChoice,
      onPick: (id) => { state.iudChoice = id; state.error = null; refresh() },
    }),
    identificationHelp(),
    hasIud() ? h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'label', htmlFor: 'onb-iud-model' }, 'Modèle', h('span', { class: 'v-onb__optional' }, ' (facultatif)')),
        h('input', {
          id: 'onb-iud-model',
          type: 'text',
          class: 'input',
          value: state.iudModel,
          attrs: { list: 'onb-iud-models', autocomplete: 'off', maxlength: 60, placeholder: 'ex. Mirena, TT380' },
          on: { input: (e) => { state.iudModel = e.target.value } },
        }),
        h('datalist', { id: 'onb-iud-models' }, MODEL_SUGGESTIONS.map((m) => h('option', { value: m })))),
      h('div', { class: 'v-onb__pair' },
        inputField({
          id: 'onb-removal-date',
          label: 'Date du retrait',
          type: 'date',
          value: state.removalDate,
          attrs: { min: MIN_REMOVAL_DATE, max: today ? addDays(today, 365) : null },
          onChange: (v) => { state.removalDate = v; state.error = null; refresh() },
        }),
        inputField({
          id: 'onb-removal-time',
          label: 'Heure',
          type: 'time',
          value: state.removalTime,
          optional: true,
          onInput: (v) => { state.removalTime = v },
          onChange: (v) => { state.removalTime = v; refresh() },
        })),
      h('p', { class: 'hint' }, 'L\'heure sert à dater précisément la fin de la fenêtre des 7 jours avant le retrait. Tu pourras la corriger plus tard dans Réglages.'),
      removalMessage()) : null)
}

/** Options face à un RNP déclaré avant le retrait (spec §3.1.4). */
function rnpAdvice(ctx) {
  let a
  try {
    a = assessRnp({ rnpDate: state.rnpDate, removalDate: state.removalDate, removalTime: state.removalTime, now: ctx.now })
  } catch {
    return null
  }
  const dateLabel = fmtDate(state.rnpDate)
  const pillsOpen = a.ulipristal.open
  // 5 jours pile : compté depuis 0 h le délai est passé, mais selon l'heure réelle du rapport
  // l'ulipristal (120 h) peut encore être possible aujourd'hui.
  const maybeToday = !pillsOpen && diffDays(state.rnpDate, ctx.now.today) === 5
  const urgenceButton = () => h('button', {
    type: 'button',
    class: 'btn btn--sm btn--primary v-onb__inline-btn',
    on: { click: () => mounted?.ctx.navigate('urgence', { date: state.rnpDate, time: null }) },
  }, icon('shield', { size: 18 }), 'Ouvrir le parcours urgence')
  const closedPillItem = (before) => (maybeToday
    ? h('li', { class: 'stack stack--sm' },
      para(`**Pilule d'urgence** : compté depuis 0 h, le délai de 120 h est passé ; si le rapport a eu lieu plus tard dans la journée, l'ulipristal peut encore être possible aujourd'hui : vérifie avec l'heure exacte dans le parcours Urgence.${before ? ' **Parles-en avant le retrait.**' : ''}`),
      before ? urgenceButton() : null)
    : h('li', {}, richText(before
      ? '**Pilule d\'urgence** : ce rapport date de plus de 5 jours, une pilule ne le couvre plus. **Parles-en avant le retrait** : les autres options restent possibles.'
      : 'Ce rapport date de plus de 5 jours : une pilule d\'urgence ne le couvre plus.')))
  const hormonalNote = hormonalRules()
    ? para('Après un DIU hormonal, l\'efficacité de l\'ulipristal est en théorie réduite par l\'hormone encore présente : le lévonorgestrel ou un DIU au cuivre peuvent être préférés. À voir avec la professionnelle.', 'hint')
    : null
  const pillItem = pillsOpen
    ? h('li', { class: 'stack stack--sm' },
      para('**Une pilule d\'urgence**, gratuite et sans ordonnance en pharmacie :'),
      bullets([
        a.levonorgestrel.open
          ? `Lévonorgestrel 1,5 mg : ${fmtDeadline(a.levonorgestrel.until, ctx.now.today)} (72 h).`
          : 'Lévonorgestrel 1,5 mg : le délai de 72 h est dépassé.',
        `Ulipristal 30 mg : ${fmtDeadline(a.ulipristal.until, ctx.now.today)} (120 h).`,
      ], 'v-onb__list v-onb__list--small'),
      a.removal === 'apres' ? null : para('Le délai court déjà : **n\'attends pas le rendez-vous du retrait** si la date limite tombe avant.', 'hint'),
      hormonalNote,
      h('p', { class: 'hint' }, 'Lune compte depuis 0 h le jour du rapport, par prudence : si tu connais l\'heure, le délai réel est un peu plus long.'))
    : closedPillItem(true)
  const copperItem = h('li', {}, richText(`**Un DIU au cuivre** posé ${a.removal === 'apres' ? 'en urgence' : 'à la place'} : la contraception d\'urgence la plus efficace. En France, jusqu\'à 120 h (5 jours) après le premier rapport à risque ; selon les dates, la professionnelle te dira si c'est encore possible.`))
  const testItem = alertBox('info', 'test', `Test de grossesse le ${fmtDate(a.testDate, 'complet')}`,
    para(`21 jours après ce rapport, ${a.removal === 'apres' ? 'même si tu as pris une contraception d\'urgence' : 'si le risque n\'a pas été supprimé (par exemple si le retrait n\'a pas été reporté)'}. Avant cette date, un test négatif ne permet pas de conclure. Lune te le rappellera.`))

  if (a.removal === 'apres') {
    return h('div', { class: 'stack' },
      alertBox('urgent', 'alert', 'Le retrait a déjà eu lieu : agis vite si un délai est encore ouvert',
        para(`Le rapport du ${dateLabel} tombe dans les 7 jours qui ont précédé le retrait : une grossesse est possible.`),
        h('ul', { class: 'v-onb__options' }, pillsOpen ? pillItem : closedPillItem(false), copperItem),
        urgenceButton()),
      testItem)
  }

  const delay = diffDays(state.removalDate, a.safeRemovalFrom)
  const delayText = delay !== null && delay > 0
    ? ` Il suffit d'un report de ${delay} ${delay > 1 ? 'jours' : 'jour'}.`
    : ''
  return h('div', { class: 'stack' },
    alertBox('urgent', 'alert',
      a.removal === 'aujourdhui' ? 'Dis-le à la professionnelle AVANT le retrait, s\'il n\'a pas encore eu lieu' : 'Dis-le à la professionnelle AVANT le retrait',
      para(`Le rapport du ${dateLabel} tombe dans les 7 jours qui précèdent le retrait : une fois le DIU retiré, une grossesse est possible. Voici les options qu'elle peut te proposer.`),
      h('ul', { class: 'v-onb__options' },
        h('li', {}, richText(`**Reporter le retrait** : c'est la première option. Un retrait à partir du ${fmtDate(a.safeRemovalFrom)}, sans nouveau rapport non protégé d'ici là, supprime ce risque.${delayText}`)),
        pillItem,
        copperItem)),
    testItem)
}

function stepBeforeRemoval(ctx) {
  const today = ctx.now?.today
  const start = windowStart()
  const status = isValidIso(state.removalDate) && ctx.now ? removalStatus(state.removalDate, state.removalTime, ctx.now) : 'avant'
  const past = status === 'apres'
  const question = past
    ? `Y a-t-il eu un rapport sans préservatif, ou un incident de préservatif, entre le ${fmtDate(start)} et le retrait ?`
    : `Y a-t-il eu un rapport sans préservatif, ou un incident de préservatif, depuis le ${fmtDate(start)} ?`
  const maxDate = today && state.removalDate > today ? today : state.removalDate

  let answer = null
  if (state.rnp === 'non') {
    answer = alertBox('attention', 'shield', 'Protection nécessaire dès le retrait',
      past ? null : para('D\'ici là, continue d\'utiliser un préservatif à chaque rapport : un rapport non protégé avant le retrait compte aussi. Si cela arrive, ouvre le parcours urgence (bouton « Urgence » en haut de l\'écran).'))
  } else if (state.rnp === 'oui') {
    const validDate = isValidIso(state.rnpDate) && state.rnpDate >= start && state.rnpDate <= maxDate
    answer = h('div', { class: 'stack' },
      inputField({
        id: 'onb-rnp-date',
        label: 'Date du dernier rapport à risque',
        hint: `Entre le ${fmtDate(start, 'long')} et le ${fmtDate(maxDate, 'long')}. S'il y en a eu plusieurs, indique le plus récent.`,
        type: 'date',
        value: state.rnpDate,
        attrs: { min: start, max: maxDate },
        onChange: (v) => { state.rnpDate = v; state.error = null; refresh() },
      }),
      validDate ? rnpAdvice(ctx) : null)
  } else if (state.rnp === 'ne_sait_pas') {
    const testDate = addDays(state.removalDate, 21)
    answer = h('div', { class: 'stack' },
      alertBox('attention', 'alert', 'Dans le doute, fais comme s\'il y avait eu un risque',
        past
          ? para('Le retrait a déjà eu lieu. Si un rapport à risque date de moins de 5 jours, une contraception d\'urgence est peut-être encore possible : ouvre le parcours urgence pour vérifier les délais.')
          : para('**Parles-en à la professionnelle avant le retrait.** Elle pourra te proposer de reporter le retrait, ou une contraception d\'urgence selon les dates (pilule jusqu\'à 72 h ou 120 h après le rapport, DIU au cuivre).'),
        past ? h('button', {
          type: 'button',
          class: 'btn btn--sm btn--primary v-onb__inline-btn',
          on: { click: () => mounted?.ctx.navigate('urgence') },
        }, icon('shield', { size: 18 }), 'Ouvrir le parcours urgence') : null),
      alertBox('info', 'test', `Test de grossesse le ${fmtDate(testDate, 'complet')}`,
        para('21 jours après le retrait, sans attendre tes règles. Avant cette date, un test négatif ne permet pas de conclure. Lune te le rappellera.')))
  }

  return h('div', { class: 'stack' },
    para(TEXTS?.why7days || 'Les spermatozoïdes peuvent survivre jusqu\'à 7 jours : un rapport non protégé dans les 7 jours avant le retrait peut mener à une grossesse.', 'v-onb__lead'),
    choiceGroup({
      id: 'onb-rnp',
      legend: question,
      hint: past ? null : 'Jusqu\'au retrait inclus.',
      options: RNP_CHOICES,
      value: state.rnp,
      variant: 'seg',
      onPick: (id) => { state.rnp = id; state.error = null; refresh() },
    }),
    answer,
    past || state.rnp === 'non' ? null : h('p', { class: 'hint' }, 'D\'ici le retrait, utilise un préservatif à chaque rapport.'))
}

function stepMeasures(ctx) {
  const tomorrow = ctx.now?.today ? addDays(ctx.now.today, 1) : null
  const beforeRemoval = hasIud() && ctx.now && isValidIso(state.removalDate) && state.removalDate >= ctx.now.today
  const routes = TEMP_ROUTES.map((r) => (r.id === 'buccale' ? r : { ...r, hint: 'Au moins 3 minutes.', recommended: true, recommendedLabel: 'Recommandée' }))
  return h('div', { class: 'stack' },
    choiceGroup({
      id: 'onb-route',
      legend: 'Où mesures-tu ta température ?',
      hint: 'Une seule voie et un seul thermomètre par cycle. Changer de voie rend le cycle non évaluable automatiquement ; si tu changes de thermomètre, coche « Nouveau thermomètre » dans Noter (ou déclare le cycle non évaluable).',
      options: routes,
      value: state.tempRoute,
      onPick: (id) => { state.tempRoute = id; refresh() },
    }),
    inputField({
      id: 'onb-wake',
      label: 'Heure de réveil habituelle',
      hint: 'Mesure au réveil, avant de te lever, à peu près à la même heure. Une mesure prise à plus d\'1 h 30 de ton heure habituelle peut être perturbée : Lune te posera la question.',
      type: 'time',
      value: state.wakeTime,
      optional: true,
      onInput: (v) => { state.wakeTime = v },
    }),
    choiceGroup({
      id: 'onb-sign',
      legend: 'Quel signe observes-tu avec la température ?',
      options: SIGN_CHOICES,
      value: state.secondarySign,
      onPick: (id) => { state.secondarySign = id; refresh() },
    }),
    h('section', { class: 'card stack stack--sm' },
      h('h2', { class: 'section-title v-onb__h-icon' }, icon('thermo', { size: 20 }), 'Ton thermomètre'),
      bullets([
        'Numérique, **à 2 décimales** (ex. 36,47), marqué CE.',
        '**Pas** de thermomètre d\'oreille, d\'aisselle ni infrarouge.',
        'Au moins **3 minutes** (5 minutes en buccale), jamais seulement « jusqu\'au bip ».',
        'Après au moins 1 h de repos. Vise au moins 3 h de sommeil et signale les nuits courtes.',
      ])),
    alertBox('info', 'sun', tomorrow ? `Commence dès demain matin, ${fmtDate(tomorrow)}` : 'Commence dès demain matin',
      para(beforeRemoval
        ? 'Même avant le retrait : ces valeurs comptent comme valeurs basses. Il en faut au moins 6 avant de pouvoir repérer une montée.'
        : 'Il faut au moins 6 valeurs basses avant de pouvoir repérer une montée : chaque matin compte.')))
}

function stepRules(ctx) {
  const strict = strictChecked()
  // Introduction rejouée : les réglages actuels sont gardés (seul le mode strict est modifiable ici).
  const replay = !!ctx?.data?.profile?.onboardingDone
  const rules = ctx?.data?.rules || {}
  const learningOn = replay ? rules.learningMode !== 'off' : true
  const preRuleOn = replay ? rules.preOvulatoryRule === true : false
  return h('div', { class: 'stack' },
    h('ul', { class: 'v-onb__points' },
      point('shield', 'Fertile par défaut',
        'Un jour est considéré comme fertile tant que tes mesures n\'ont pas prouvé le contraire. Donnée manquante, douteuse ou en attente : **protection nécessaire**.'),
      point('check', 'Le double contrôle',
        'La phase infertile après l\'ovulation ne commence que lorsque la **température ET la glaire** (ou le col) l\'ont confirmée, à partir de 18 h.'),
      point('book', 'Des cycles d\'apprentissage',
        'Pendant les 3 premiers cycles complets après le retrait, Lune affiche son évaluation mais **recommande toujours une protection**. Les nombreux jours fertiles de ces cycles sont attendus.'),
      point('calendar', 'Des prévisions indicatives',
        'Prochaines règles, ovulation estimée : des fourchettes pour t\'organiser. Elles **ne rendent jamais un jour infertile**.')),
    h('section', { class: 'card stack stack--sm' },
      h('h2', { class: 'section-title' }, replay ? 'Tes réglages actuels' : 'Tes réglages de départ, prudents'),
      h('ul', { class: 'v-onb__settings' },
        h('li', {}, icon(learningOn ? 'check' : 'x', { size: 18 }), learningOn
          ? h('span', {}, h('strong', {}, 'Cycles d\'apprentissage : activés.'), replay ? ' Ce réglage est conservé.' : ' Tu pourras en sortir plus tard, après un récapitulatif des risques.')
          : h('span', {}, h('strong', {}, 'Cycles d\'apprentissage : désactivés.'), ' Ce réglage est conservé ; tu peux le réactiver dans Réglages.')),
        h('li', {}, icon(preRuleOn ? 'calendar' : 'lock', { size: 18 }), preRuleOn
          ? h('span', {}, h('strong', {}, 'Règle de début de cycle : activée.'), ' Ce réglage est conservé ; tu peux la désactiver dans Réglages.')
          : h('span', {}, h('strong', {}, 'Règle de début de cycle : désactivée.'), ' Lune n\'accorde aucun jour infertile en début de cycle.'))),
      h('label', { class: ['v-onb__check', strict && 'is-on'], htmlFor: 'onb-strict' },
        h('input', {
          type: 'checkbox',
          id: 'onb-strict',
          checked: strict,
          attrs: { 'aria-describedby': 'onb-strict-aide' },
          on: { change: (e) => { state.strictFSRH = e.target.checked; refresh() } },
        }),
        h('span', { class: 'stack stack--sm' },
          h('span', {}, h('strong', {}, 'Mode strict FSRH')),
          h('span', { class: 'hint', id: 'onb-strict-aide' },
            'Protection tous les jours jusqu\'à ce que 3 cycles se soient écoulés depuis le retrait et que tes cycles soient réguliers. ',
            hormonalRules() ? 'Recommandé après un DIU hormonal ou de type inconnu.' : 'Recommandé surtout après un DIU hormonal ou de type inconnu.'))),
      h('p', { class: 'hint' }, 'Tu pourras modifier ces réglages dans Réglages.')))
}

function stepStart(ctx) {
  const year = ctx.now?.today ? yearOf(ctx.now.today) : 2026
  const iud = IUD_CHOICES.find((c) => c.id === state.iudChoice)
  const route = TEMP_ROUTES.find((r) => r.id === state.tempRoute)
  const rows = [
    ['Stérilet', iud ? (hasIud() && state.iudModel.trim() ? `${iud.recap || iud.label} (${state.iudModel.trim()})` : iud.recap || iud.label) : '—'],
    hasIud() ? ['Retrait', isValidIso(state.removalDate) ? `${fmtDate(state.removalDate, 'complet')}${TIME_RE.test(state.removalTime) ? ` à ${state.removalTime.replace(':', ' h ')}` : ''}` : '—'] : null,
    ['Mesure', route ? route.label : '—'],
    ['Signe associé', state.secondarySign === 'col' ? 'Col de l\'utérus' : 'Glaire cervicale'],
    ['Mode strict FSRH', strictChecked() ? 'Activé' : 'Désactivé'],
  ].filter(Boolean)
  return h('div', { class: 'stack' },
    inputField({
      id: 'onb-birth-year',
      label: 'Année de naissance',
      hint: 'Sert seulement à appliquer les seuils de régularité des cycles selon l\'âge (FIGO).',
      type: 'text',
      inputmode: 'numeric',
      value: state.birthYear,
      optional: true,
      attrs: { maxlength: 4, pattern: '[0-9]*', placeholder: `ex. ${year - 30}` },
      onInput: (v) => { state.birthYear = v.trim() },
    }),
    h('section', { class: 'card card--flat stack stack--sm' },
      h('h2', { class: 'section-title' }, 'Récapitulatif'),
      h('dl', { class: 'v-onb__recap' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
    h('p', { class: 'hint' }, 'Tu arriveras sur la saisie du jour : note déjà ce que tu observes (saignement, glaire, température si tu l\'as prise).'),
    h('div', { class: 'v-onb__demo' },
      h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        id: 'onb-demo',
        on: { click: () => mounted?.ctx.actions.loadDemo() },
      }, icon('sparkle', { size: 18 }), 'Voir d\'abord une démo'),
      h('p', { class: 'hint' }, 'Données fictives, rien n\'est enregistré. Tu reviendras ici ensuite.')))
}

/* ------------------------------------------------------------------ */
/* Validation et enregistrement                                        */
/* ------------------------------------------------------------------ */

function validate(stepId, ctx) {
  const today = ctx.now?.today
  if (stepId === 'avertissement' && !state.disclaimer) {
    return { text: 'Coche la case pour continuer : Lune n\'est pas un dispositif médical.', focusId: 'onb-disclaimer' }
  }
  if (stepId === 'sterilet') {
    if (!state.iudChoice) return { text: 'Choisis une réponse pour continuer.', focusId: 'onb-iud-cuivre' }
    if (hasIud()) {
      if (ISO_RE.test(state.removalDate || '') && state.removalDate < MIN_REMOVAL_DATE) {
        return { text: 'La date du retrait semble trop ancienne : vérifie l\'année.', focusId: 'onb-removal-date' }
      }
      if (!isValidIso(state.removalDate)) return { text: 'Indique la date du retrait.', focusId: 'onb-removal-date' }
      if (today && diffDays(today, state.removalDate) > 365) return { text: 'La date du retrait semble trop lointaine : vérifie-la.', focusId: 'onb-removal-date' }
      if (state.removalTime && !TIME_RE.test(state.removalTime)) return { text: 'L\'heure du retrait est incomplète.', focusId: 'onb-removal-time' }
    }
  }
  if (stepId === 'avant-retrait') {
    if (!state.rnp) return { text: 'Choisis une réponse pour continuer.', focusId: 'onb-rnp-oui' }
    if (state.rnp === 'oui') {
      const start = windowStart()
      const max = today && state.removalDate > today ? today : state.removalDate
      if (!isValidIso(state.rnpDate)) return { text: 'Indique la date du dernier rapport à risque.', focusId: 'onb-rnp-date' }
      if (state.rnpDate < start || state.rnpDate > max) {
        return { text: `La date doit être comprise entre le ${fmtDate(start, 'long')} et le ${fmtDate(max, 'long')}.`, focusId: 'onb-rnp-date' }
      }
    }
  }
  if (stepId === 'mesures' && state.wakeTime && !TIME_RE.test(state.wakeTime)) {
    return { text: 'L\'heure de réveil est incomplète.', focusId: 'onb-wake' }
  }
  if (stepId === 'depart' && state.birthYear) {
    const y = Number(state.birthYear)
    const current = today ? yearOf(today) : 2026
    if (!/^\d{4}$/.test(state.birthYear) || y < current - 70 || y > current - 8) {
      return { text: 'Année de naissance invalide : écris-la sur 4 chiffres (ex. 1994), ou laisse le champ vide.', focusId: 'onb-birth-year' }
    }
  }
  return null
}

function finish(ctx) {
  const iud = hasIud()
  const model = state.iudModel.trim()
  // Introduction rejouée : on ne réécrit pas les règles choisies dans Réglages.
  if (ctx.data?.profile?.onboardingDone) ctx.actions.updateRules({ strictFSRH: strictChecked() })
  else ctx.actions.updateRules({ learningMode: 'auto', preOvulatoryRule: false, strictFSRH: strictChecked() })
  ctx.actions.updateProfile({
    iudType: iud ? state.iudChoice : null,
    iudModel: iud && model ? model : null,
    iudRemovalDate: iud ? state.removalDate : null,
    iudRemovalTime: iud && TIME_RE.test(state.removalTime) ? state.removalTime : null,
    rnpBeforeRemoval: iud ? state.rnp : null,
    rnpBeforeRemovalDate: iud && state.rnp === 'oui' ? state.rnpDate : null,
    birthYear: state.birthYear ? Number(state.birthYear) : null,
    tempRoute: state.tempRoute,
    secondarySign: state.secondarySign,
    usualWakeTime: TIME_RE.test(state.wakeTime) ? state.wakeTime : null,
    disclaimerAcceptedAt: ctx.data?.profile?.disclaimerAcceptedAt || ctx.now.today,
    onboardingDone: true,
  })
  ctx.navigate('noter', { date: ctx.now.today })
  state = null
}

/* ------------------------------------------------------------------ */
/* Parcours                                                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  { id: 'bienvenue', title: 'Bienvenue dans Lune', build: stepWelcome },
  { id: 'installer', title: 'Installe l\'app', build: stepInstall, show: (ctx) => !ctx.env?.isStandalone && !ctx.env?.isArtifact, next: 'Continuer quand même' },
  { id: 'avertissement', title: 'Avant tout', build: stepDisclaimer },
  { id: 'sterilet', title: 'Ton stérilet', build: stepIud },
  { id: 'avant-retrait', title: 'Les 7 jours avant le retrait', build: stepBeforeRemoval, show: () => hasIud() },
  { id: 'mesures', title: 'Tes mesures', build: stepMeasures },
  { id: 'decision', title: 'Comment Lune décide', build: stepRules },
  { id: 'depart', title: 'C\'est parti', build: stepStart, next: 'Commencer' },
]

function visibleSteps(ctx) {
  return STEPS.filter((s) => !s.show || s.show(ctx))
}

/**
 * Étapes comptées dans « Étape X sur N » : tant que le stérilet n'est pas choisi, on compte la
 * branche la plus longue (avec « Les 7 jours avant le retrait »), pour que N ne grandisse jamais
 * en cours de route.
 */
export function countedSteps(ctx) {
  return STEPS.filter((s) => {
    if (s.id === 'avant-retrait') return state?.iudChoice === null || state?.iudChoice === undefined || hasIud()
    return !s.show || s.show(ctx)
  })
}

function go(delta, ctx) {
  const steps = visibleSteps(ctx)
  const idx = Math.max(0, steps.findIndex((s) => s.id === state.step))
  if (delta > 0) {
    const err = validate(steps[idx].id, ctx)
    if (err) {
      state.error = { ...err, step: steps[idx].id }
      refresh({ focusId: err.focusId })
      return
    }
    if (idx === steps.length - 1) {
      finish(ctx)
      return
    }
  }
  state.error = null
  const next = steps[Math.min(steps.length - 1, Math.max(0, idx + delta))]
  state.step = next.id
  refresh({ toTop: true })
}

function view(ctx) {
  const steps = visibleSteps(ctx)
  let idx = steps.findIndex((s) => s.id === state.step)
  if (idx < 0) {
    idx = 0
    state.step = steps[0].id
  }
  const step = steps[idx]
  const counted = countedSteps(ctx)
  const n = counted.length
  const pos = Math.max(0, counted.findIndex((s) => s.id === step.id)) + 1
  const isFirst = idx === 0
  const isLast = idx === steps.length - 1
  const error = state.error?.step === step.id ? state.error : null

  return h('div', { class: 'v-onb' },
    h('header', { class: 'v-onb__head' },
      stepSky(pos, n, step.id),
      h('div', { class: 'spread' },
        h('p', { class: 'eyebrow' }, `Étape ${pos} sur ${n}`),
        h('p', { class: 'eyebrow v-onb__brand' }, icon('crescent', { size: 16 }), 'Lune')),
      h('div', {
        class: 'v-onb__progress',
        role: 'progressbar',
        attrs: { 'aria-valuemin': 1, 'aria-valuemax': n, 'aria-valuenow': pos, 'aria-valuetext': `Étape ${pos} sur ${n} : ${step.title}` },
        ariaLabel: 'Progression',
      }, h('span', { class: 'v-onb__progress-fill', style: { width: `${Math.round((pos / n) * 100)}%` } })),
      h('h1', { class: 'display v-onb__title', id: 'onb-title', tabIndex: -1 }, step.title)),
    h('div', { class: 'v-onb__body' }, step.build(ctx)),
    error ? h('p', { class: 'v-onb__error', role: 'alert' }, icon('alert', { size: 18 }), error.text) : null,
    h('nav', { class: 'v-onb__nav', ariaLabel: 'Étapes du premier lancement' },
      isFirst ? h('span', { class: 'v-onb__nav-spacer' }) : h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        id: 'onb-prev',
        on: { click: () => go(-1, mounted.ctx) },
      }, icon('chevron-left', { size: 18 }), 'Précédent'),
      h('button', {
        type: 'button',
        class: 'btn btn--primary v-onb__next',
        id: 'onb-next',
        on: { click: () => go(1, mounted.ctx) },
      }, step.next || 'Suivant', isLast ? null : icon('chevron-right', { size: 18 }))))
}

/**
 * Reconstruit le parcours dans la racine montée.
 * @param {{ focusId?: string, toTop?: boolean }} [opts]
 */
function refresh({ focusId, toTop = false } = {}) {
  if (!mounted || !state) return
  const doc = mounted.root.ownerDocument
  const keep = focusId || doc.activeElement?.id || null
  mounted.root.replaceChildren(view(mounted.ctx))
  if (toTop) {
    try { doc.defaultView?.scrollTo(0, 0) } catch { /* aperçu sandboxé */ }
    doc.getElementById('onb-title')?.focus({ preventScroll: true })
  } else if (keep) {
    doc.getElementById(keep)?.focus({ preventScroll: !focusId })
  }
}

/**
 * Affiche le premier lancement (route 'onboarding').
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 */
export function render(root, ctx) {
  if (!state) state = initState(ctx)
  mounted = { root, ctx }
  root.append(view(ctx))
}
