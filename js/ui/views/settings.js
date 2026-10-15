/**
 * Lune — vue « Réglages » (route 'reglages').
 *
 * Cartes : profil, règles de calcul, affichage, sauvegarde (export chiffré par défaut,
 * exports non chiffrés JSON / CSV, import avec déchiffrement, persistance, effacement), rappels sans serveur (.ics, Raccourcis, réveil), résumé
 * imprimable pour un·e soignant·e, démonstration, introduction, à propos.
 *
 * Toute action passe par ctx.actions (qui ré-analyse et re-rend la vue) ; les choix
 * risqués passent par ctx.ui.confirm. Aucun accès au navigateur au chargement.
 */

import {
  h, icon, fmtDate, plural, richText, diffDays, addDays,
  TEMP_ROUTES, SYMPTOMS, MOODS,
} from '../dom.js'
import {
  exportJSON, importJSONDetailed, exportEncrypted, decryptBackup, exportCSV, persistenceStatus, SCHEMA,
} from '../../store.js'
import { TEXTS } from '../../content/tips.js'

const APP_VERSION = '1.0'
const BACKUP_STALE_DAYS = 7
const IMPORT_MAX_BYTES = 10 * 1024 * 1024
const SUMMARY_MAX_CYCLES = 13
const SUMMARY_SYMPTOM_DAYS = 180
const PRINT_CLASS = 'v-settings-printing'
const REMINDER_LABEL = 'Rappel du matin'

const IUD_TYPES = [
  { id: 'cuivre', label: 'Cuivre' },
  { id: 'hormonal', label: 'Hormonal' },
  { id: 'inconnu', label: 'Je ne sais pas' },
  { id: 'aucun', label: 'Pas de DIU retiré récemment' },
]
const IUD_LABELS = { cuivre: 'DIU au cuivre', hormonal: 'DIU hormonal (lévonorgestrel)', inconnu: 'DIU de type inconnu' }
const IUD_MODELS = ['Mirena', 'Donasert', 'Kyleena', 'Jaydess', 'TT380', 'NT380', 'UT380']
const RNP_OPTIONS = [
  { id: 'non', label: 'Non' },
  { id: 'oui', label: 'Oui' },
  { id: 'ne_sait_pas', label: 'Je ne sais pas' },
]
const SIGN_OPTIONS = [
  { id: 'glaire', label: 'Glaire cervicale' },
  { id: 'col', label: 'Col de l\'utérus' },
]
const THEME_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: 'sparkle' },
  { id: 'clair', label: 'Clair', icon: 'sun' },
  { id: 'sombre', label: 'Sombre', icon: 'moon' },
]
const REGULARITY_LABELS = { reguliers: 'Réguliers', irreguliers: 'Irréguliers', inconnu: 'Pas encore évaluable' }

/**
 * Brouillon du formulaire de profil : survit aux re-rendus (un autre réglage modifié
 * re-construit la vue) tant que le profil enregistré n'a pas changé entre-temps.
 * @type {{ base: string, values: object } | null}
 */
let profileDraft = null

/* ------------------------------------------------------------------ */
/* Petits utilitaires                                                  */
/* ------------------------------------------------------------------ */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function fmtNum(x, digits = 1) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—'
  return x.toLocaleString('fr-FR', { maximumFractionDigits: digits })
}

function days(n) {
  return `${fmtNum(n)} ${plural(n, 'jour')}`
}

/** Lien interne vers une fiche « Comprendre » (vrai href, navigation par le routeur). */
function articleLink(ctx, article, label) {
  return h('a', {
    href: `#comprendre/${article}`,
    class: 'v-settings__link',
    on: { click: (e) => { e.preventDefault(); ctx.navigate('comprendre', { article }) } },
  }, icon('book', { size: 18 }), h('span', {}, label))
}

/** Ligne d'état : toujours couleur + icône + texte. */
function statusLine(tone, iconName, ...children) {
  return h('div', { class: ['v-settings__status', `v-settings__status--${tone}`] },
    icon(iconName, { size: 20 }), h('div', { class: 'v-settings__status-text' }, ...children))
}

function card(id, title, iconName, ...children) {
  return h('section', { class: 'card stack v-settings__card', id, ariaLabelledby: `${id}-title` },
    h('h2', { class: 'section-title v-settings__title', id: `${id}-title` },
      h('span', { class: 'v-settings__ico', ariaHidden: 'true' }, icon(iconName, { size: 22 })), h('span', {}, title)),
    ...children)
}

function field(id, label, control, hint) {
  return h('div', { class: 'field' },
    h('label', { class: 'label', htmlFor: id }, label),
    control,
    hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null)
}

/**
 * Groupe de boutons radio présenté en segments (navigation native aux flèches).
 * @returns {{ el: HTMLElement, value: () => string }}
 */
function radioSeg({ name, legend, options, value, onChange, wrap = false, hint }) {
  const opts = options.map((opt) => {
    const input = h('input', {
      type: 'radio', class: 'sr-only', name, id: `${name}-${opt.id}`, value: opt.id, checked: opt.id === value,
      on: { change: () => { sync(); if (onChange) onChange(opt.id) } },
    })
    const lab = h('label', { class: ['seg__opt', opt.id === value && 'is-on'], htmlFor: `${name}-${opt.id}` },
      opt.icon ? icon(opt.icon, { size: 18 }) : null, h('span', {}, opt.label))
    return { input, lab }
  })
  function sync() {
    for (const { input, lab } of opts) lab.classList.toggle('is-on', input.checked)
  }
  const el = h('fieldset', { class: 'v-settings__fieldset field', ariaDescribedby: hint ? `${name}-hint` : null },
    h('legend', { class: 'label' }, legend),
    h('div', { class: ['seg', wrap && 'seg--wrap'] }, opts.map(({ input, lab }) => [input, lab])),
    hint ? h('p', { class: 'hint', id: `${name}-hint` }, hint) : null)
  return { el, value: () => (opts.find((o) => o.input.checked)?.input.value ?? null) }
}

/** Interrupteur (case à cocher role="switch") avec libellé, état écrit et explication. */
function switchRow({ id, label, hint, checked, badge, onChange }) {
  const stateText = h('span', { class: 'v-settings__switch-state', ariaHidden: 'true' }, checked ? 'Activé' : 'Désactivé')
  const input = h('input', {
    type: 'checkbox', role: 'switch', id, class: 'v-settings__switch', checked,
    ariaDescribedby: hint ? `${id}-hint` : null,
    on: {
      change: (e) => {
        const el = e.currentTarget
        const revert = () => { el.checked = !el.checked; stateText.textContent = el.checked ? 'Activé' : 'Désactivé' }
        stateText.textContent = el.checked ? 'Activé' : 'Désactivé'
        onChange(el.checked, revert)
      },
    },
  })
  return h('div', { class: 'v-settings__toggle' },
    h('div', { class: 'v-settings__toggle-text' },
      h('label', { class: 'label', htmlFor: id }, label),
      badge || null,
      hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null),
    h('div', { class: 'v-settings__toggle-control' }, input, stateText))
}

function bulletList(items) {
  return h('ul', { class: 'v-settings__list' }, items.map((t) => h('li', {}, richText(t))))
}

function confirmBody(intro, items, outro) {
  return h('span', { class: 'v-settings__confirm' },
    intro ? h('span', { class: 'v-settings__confirm-p' }, richText(intro)) : null,
    items && items.length ? bulletList(items) : null,
    outro ? h('span', { class: 'v-settings__confirm-p' }, richText(outro)) : null)
}

/** Cycle en cours (ou null). */
function currentCycle(analysis) {
  const cur = analysis?.current
  if (!cur || !Array.isArray(analysis.cycles)) return null
  return analysis.cycles[cur.cycleIndex] ?? null
}

/* ------------------------------------------------------------------ */
/* Fichiers : partage, téléchargement, presse-papiers                  */
/* ------------------------------------------------------------------ */

function downloadText(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = h('a', { href: url, class: 'sr-only', attrs: { download: name } })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function shareableFile(name, type, text) {
  try {
    if (typeof File !== 'function' || typeof navigator.canShare !== 'function') return null
    const file = new File([text], name, { type })
    return navigator.canShare({ files: [file] }) ? file : null
  } catch {
    return null
  }
}

/**
 * Repli sans téléchargement (aperçu Artifact) : copie dans le presse-papiers — lancée
 * de façon synchrone dans le geste — puis zone de texte sélectionnable dans une feuille.
 */
function copyFallback(ctx, { title, text, onSaved }) {
  let saved = false
  const markSaved = () => {
    if (saved) return
    saved = true
    if (onSaved) onSaved()
  }
  let copyPromise
  try {
    copyPromise = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('indisponible'))
  } catch (err) {
    copyPromise = Promise.reject(err)
  }
  const status = h('p', { class: 'hint', role: 'status' }, 'Copie en cours…')
  const area = h('textarea', {
    class: 'input mono v-settings__export-text', id: 'set-export-text', readOnly: true, value: text, rows: 8,
    attrs: { spellcheck: 'false', autocomplete: 'off' },
  })
  const close = ctx.ui.openSheet({
    title,
    content: h('div', { class: 'stack v-settings__sheet' },
      status,
      field('set-export-text', 'Contenu à garder', area,
        'Colle-le dans une note ou un fichier que tu gardes en lieu sûr (pas dans un message que d\'autres peuvent lire).'),
      h('div', { class: 'row' },
        h('button', {
          type: 'button', class: 'btn',
          on: {
            click: () => {
              area.focus()
              area.select()
              try {
                navigator.clipboard?.writeText(text).then(() => {
                  status.textContent = 'Copié dans le presse-papiers.'
                }, () => {})
              } catch { /* sélection manuelle */ }
            },
          },
        }, icon('copy', { size: 18 }), 'Tout sélectionner et copier'),
        h('button', {
          type: 'button', class: 'btn btn--primary',
          on: { click: () => { markSaved(); close() } },
        }, icon('check', { size: 18 }), 'C\'est enregistré'))),
  })
  copyPromise.then(() => {
    status.textContent = 'Copié dans le presse-papiers. Colle-le maintenant dans un endroit sûr.'
    markSaved()
  }, () => {
    status.textContent = 'Copie automatique impossible : sélectionne le texte ci-dessous et copie-le.'
  })
}

/**
 * Remet un fichier texte à l'utilisatrice selon l'environnement.
 * Aperçu sans téléchargement → presse-papiers ; mobile avec partage de fichiers →
 * feuille de partage (« Enregistrer dans Fichiers ») ; sinon téléchargement.
 * @returns {Promise<'shared'|'downloaded'|'fallback'|'cancelled'|'failed'>}
 */
async function deliverFile(ctx, { name, type, text, title, onSaved }) {
  const env = ctx.env || {}
  if (!env.canDownload) {
    copyFallback(ctx, { title, text, onSaved })
    return 'fallback'
  }
  if (env.canShare && env.platform !== 'autre') {
    const file = shareableFile(name, type, text)
    if (file) {
      try {
        await navigator.share({ files: [file], title })
        if (onSaved) onSaved()
        return 'shared'
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled'
        // Partage refusé : on retombe sur le téléchargement.
      }
    }
  }
  try {
    downloadText(name, type, text)
    if (onSaved) onSaved()
    return 'downloaded'
  } catch {
    ctx.ui.toast('Le fichier n\'a pas pu être créé sur cet appareil.')
    return 'failed'
  }
}

/* ------------------------------------------------------------------ */
/* Rappel .ics                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fichier iCalendar d'un rappel quotidien neutre (aucune donnée de santé).
 * Heure « flottante » : l'agenda l'interprète dans le fuseau local de l'appareil.
 * @param {{ time: string, startDate: string, stamp: string, uid: string }} opts
 *   time 'HH:MM' ; startDate 'YYYY-MM-DD' ; stamp UTC 'YYYYMMDDTHHMMSSZ' ; uid unique
 * @returns {string} contenu .ics (fins de ligne CRLF)
 */
export function buildReminderICS({ time, startDate, stamp, uid }) {
  const date = startDate.replace(/-/g, '')
  const hhmm = time.replace(':', '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lune//Rappel//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${date}T${hhmm}00`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${REMINDER_LABEL}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${REMINDER_LABEL}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/* ------------------------------------------------------------------ */
/* 1. Profil                                                           */
/* ------------------------------------------------------------------ */

function profileValues(p) {
  return {
    iudType: p.iudType || 'aucun',
    iudModel: p.iudModel || '',
    iudRemovalDate: p.iudRemovalDate || '',
    iudRemovalTime: p.iudRemovalTime || '',
    rnpBeforeRemoval: p.rnpBeforeRemoval || '',
    rnpBeforeRemovalDate: p.rnpBeforeRemovalDate || '',
    birthYear: p.birthYear ? String(p.birthYear) : '',
    tempRoute: p.tempRoute || 'buccale',
    usualWakeTime: p.usualWakeTime || '',
    secondarySign: p.secondarySign || 'glaire',
  }
}

const REMOVAL_DATE_MIN = '2000-01-01'
const REMOVAL_DATE_MAX_AHEAD = 365

/** Bornes du champ « Date du retrait » : du 2000-01-01 à aujourd'hui + 365 jours. */
function removalDateBounds(today) {
  return { min: REMOVAL_DATE_MIN, max: addDays(today, REMOVAL_DATE_MAX_AHEAD) || '' }
}

/**
 * Vérifie la date de retrait saisie dans Réglages (VB-8). Une date vide est acceptée.
 * Une date invraisemblable est refusée avec un message : elle n'est jamais ignorée en silence.
 * @param {string} value valeur du champ (YYYY-MM-DD ou '')
 * @param {string} today aujourd'hui (YYYY-MM-DD)
 * @returns {string|null} message d'erreur, ou null si la date est acceptable
 */
export function removalDateError(value, today) {
  if (value === '' || value === null || value === undefined) return null
  if (!ISO_RE.test(value)) return 'Date du retrait : la date n\'est pas valide.'
  const { min, max } = removalDateBounds(today)
  if (value < min || (max && value > max)) return 'La date du retrait semble invraisemblable : vérifie-la.'
  if (addDays(value, 0) === null) return 'Date du retrait : la date n\'est pas valide.'
  return null
}

/** Le cycle en cours contient-il déjà des températures ? */
function currentCycleHasTemps(ctx) {
  const cyc = currentCycle(ctx.analysis)
  if (!cyc) return false
  return Object.entries(ctx.data.days || {}).some(([iso, d]) => iso >= cyc.start && iso <= ctx.now.today && d && d.temp)
}

function profileCard(ctx) {
  const p = ctx.data.profile || {}
  const base = JSON.stringify(profileValues(p))
  if (profileDraft && profileDraft.base !== base) profileDraft = null
  const v = profileDraft ? profileDraft.values : profileValues(p)
  const thisYear = Number(ctx.now.today.slice(0, 4))

  const errorBox = h('div', { class: 'v-settings__errors', role: 'alert' })
  const dirtyNote = h('p', { class: 'hint v-settings__dirty', role: 'status' },
    profileDraft ? 'Modifications non enregistrées.' : '')

  const iudSeg = radioSeg({
    name: 'set-iud-type', legend: 'Type de DIU retiré', options: IUD_TYPES, value: v.iudType, wrap: true,
    hint: 'Si tu ne sais pas, Lune applique les règles prévues pour un DIU hormonal (plus prudentes).',
    onChange: () => updateIudVisibility(),
  })
  const model = h('input', {
    type: 'text', class: 'input', id: 'set-iud-model', value: v.iudModel, maxLength: 60,
    autocomplete: 'off', attrs: { list: 'set-iud-models', autocapitalize: 'words' },
  })
  const modelList = h('datalist', { id: 'set-iud-models' }, IUD_MODELS.map((m) => h('option', { value: m })))
  const removalBounds = removalDateBounds(ctx.now.today)
  const removalDate = h('input', {
    type: 'date', class: 'input', id: 'set-iud-removal-date', value: v.iudRemovalDate,
    attrs: { min: removalBounds.min, max: removalBounds.max },
  })
  const removalTime = h('input', { type: 'time', class: 'input', id: 'set-iud-removal-time', value: v.iudRemovalTime })
  const rnpSeg = radioSeg({
    name: 'set-rnp', legend: 'Rapport non protégé ou incident dans les 7 jours avant le retrait ?',
    options: RNP_OPTIONS, value: v.rnpBeforeRemoval, onChange: () => updateIudVisibility(),
  })
  const rnpDate = h('input', { type: 'date', class: 'input', id: 'set-rnp-date', value: v.rnpBeforeRemovalDate })
  const rnpDateField = field('set-rnp-date', 'Date du dernier rapport à risque', rnpDate)

  const iudDetails = h('div', { class: 'stack v-settings__sub' },
    field('set-iud-model', 'Modèle (facultatif)', h('div', {}, model, modelList), 'Ex. Mirena, Kyleena, TT380. Il figure sur ta carte patiente.'),
    h('div', { class: 'v-settings__pair' },
      field('set-iud-removal-date', 'Date du retrait', removalDate),
      field('set-iud-removal-time', 'Heure du retrait', removalTime)),
    rnpSeg.el,
    rnpDateField)

  function updateIudVisibility() {
    iudDetails.hidden = iudSeg.value() === 'aucun'
    rnpDateField.hidden = rnpSeg.value() !== 'oui'
  }
  updateIudVisibility()

  const birthYear = h('input', {
    type: 'text', class: 'input mono', id: 'set-birth-year', value: v.birthYear, maxLength: 4,
    autocomplete: 'off', attrs: { inputmode: 'numeric', pattern: '[0-9]*' }, ariaDescribedby: 'set-birth-year-hint',
  })
  const route = h('select', { class: 'input', id: 'set-temp-route', value: v.tempRoute, ariaDescribedby: 'set-temp-route-hint' },
    TEMP_ROUTES.map((r) => h('option', { value: r.id }, `${r.label} — ${r.hint}`)))
  const wake = h('input', { type: 'time', class: 'input', id: 'set-wake-time', value: v.usualWakeTime })
  const signSeg = radioSeg({
    name: 'set-sign', legend: 'Signe associé à la température', options: SIGN_OPTIONS, value: v.secondarySign,
    hint: 'Garde le même signe pendant tout un cycle. Le col ne doit jamais servir seul : il complète la température.',
  })

  function read() {
    return {
      iudType: iudSeg.value() || 'aucun',
      iudModel: model.value,
      iudRemovalDate: removalDate.value,
      iudRemovalTime: removalTime.value,
      rnpBeforeRemoval: rnpSeg.value() || '',
      rnpBeforeRemovalDate: rnpDate.value,
      birthYear: birthYear.value,
      tempRoute: route.value,
      usualWakeTime: wake.value,
      secondarySign: signSeg.value() || 'glaire',
    }
  }

  function markInvalid(el, bad) {
    if (bad) el.setAttribute('aria-invalid', 'true')
    else el.removeAttribute('aria-invalid')
  }

  async function save(e) {
    e.preventDefault()
    const vals = read()
    const errors = []
    const year = vals.birthYear.trim()
    const yearNum = Number(year)
    const yearBad = year !== '' && (!/^\d{4}$/.test(year) || yearNum < thisYear - 70 || yearNum > thisYear - 10)
    if (yearBad) errors.push(`Année de naissance : indique une année entre ${thisYear - 70} et ${thisYear - 10}.`)
    markInvalid(birthYear, yearBad)
    const hasIud = vals.iudType !== 'aucun'
    const dateError = hasIud ? removalDateError(vals.iudRemovalDate, ctx.now.today) : null
    if (dateError) errors.push(dateError)
    markInvalid(removalDate, dateError !== null)
    const timeBad = hasIud && vals.iudRemovalTime !== '' && !TIME_RE.test(vals.iudRemovalTime)
    if (timeBad) errors.push('Heure du retrait : l\'heure n\'est pas valide.')
    markInvalid(removalTime, timeBad)
    const wakeBad = vals.usualWakeTime !== '' && !TIME_RE.test(vals.usualWakeTime)
    if (wakeBad) errors.push('Heure de réveil : l\'heure n\'est pas valide.')
    markInvalid(wake, wakeBad)
    errorBox.replaceChildren(...errors.map((t) => h('p', { class: 'alert alert--urgent' }, icon('alert', { size: 20 }), h('span', {}, t))))
    if (errors.length) return

    const patch = {
      iudType: hasIud ? vals.iudType : null,
      iudModel: hasIud && vals.iudModel.trim() ? vals.iudModel.trim() : null,
      iudRemovalDate: hasIud && vals.iudRemovalDate ? vals.iudRemovalDate : null,
      iudRemovalTime: hasIud && vals.iudRemovalTime ? vals.iudRemovalTime : null,
      rnpBeforeRemoval: hasIud && vals.rnpBeforeRemoval ? vals.rnpBeforeRemoval : null,
      rnpBeforeRemovalDate: hasIud && vals.rnpBeforeRemoval === 'oui' && vals.rnpBeforeRemovalDate ? vals.rnpBeforeRemovalDate : null,
      birthYear: year ? yearNum : null,
      tempRoute: vals.tempRoute,
      usualWakeTime: vals.usualWakeTime || null,
      secondarySign: vals.secondarySign,
    }

    if (patch.tempRoute !== p.tempRoute && currentCycleHasTemps(ctx)) {
      const ok = await ctx.ui.confirm({
        title: 'Changer de voie de mesure ?',
        text: confirmBody(
          'Tu as déjà des températures dans ce cycle. Changer de voie **en cours de cycle rend le cycle non évaluable** à partir du changement : il restera à protéger jusqu\'à tes prochaines règles.',
          null,
          'Le plus simple : change de voie au premier jour de tes prochaines règles.'),
        confirmLabel: 'Changer quand même',
      })
      if (!ok) return
    }

    const suggestStrict = (patch.iudType === 'hormonal' || patch.iudType === 'inconnu')
      && patch.iudType !== p.iudType && !ctx.data.rules?.strictFSRH
    profileDraft = null
    ctx.actions.updateProfile(patch)
    ctx.ui.toast(suggestStrict
      ? 'Profil enregistré. Pour ton type de DIU, le mode strict FSRH est recommandé (voir « Règles de calcul »).'
      : 'Profil enregistré.')
  }

  function cancel() {
    profileDraft = null
    el.replaceWith(profileCard(ctx))
  }

  const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost', hidden: !profileDraft, on: { click: cancel } },
    'Annuler les modifications')
  function markDirty() {
    profileDraft = { base, values: read() }
    dirtyNote.textContent = 'Modifications non enregistrées.'
    cancelBtn.hidden = false
  }

  const form = h('form', {
    class: 'stack', id: 'set-profile-form', attrs: { novalidate: true },
    on: { submit: save, input: markDirty, change: markDirty },
  },
  iudSeg.el,
  iudDetails,
  h('div', { class: 'divider', role: 'presentation' }),
  field('set-birth-year', 'Année de naissance (facultatif)', birthYear,
    'Sert à appliquer les seuils de régularité des cycles selon l\'âge (FIGO).'),
  field('set-temp-route', 'Voie de mesure par défaut', route,
    'Recopiée sur chaque mesure. Garde la même pendant tout un cycle.'),
  field('set-wake-time', 'Heure de réveil habituelle (facultatif)', wake,
    'Mesure toujours au réveil, avant de te lever, à heure à peu près fixe.'),
  signSeg.el,
  errorBox,
  dirtyNote,
  h('div', { class: 'row' },
    h('button', { type: 'submit', class: 'btn btn--primary' }, icon('check', { size: 18 }), 'Enregistrer mon profil'),
    cancelBtn))

  const el = card('set-profile', 'Mon profil', 'edit', form)
  return el
}

/* ------------------------------------------------------------------ */
/* 2. Règles de calcul                                                 */
/* ------------------------------------------------------------------ */

const RULES_INTRO = 'Activer le mode apprentissage, le mode strict FSRH ou la valeur haute supplémentaire rend Lune plus prudente. Les désactiver, ou activer la règle de début de cycle, la rend moins prudente.'

/**
 * Aperçu, avant activation, du nombre de jours que la règle de début de cycle accorderait
 * (spec §2.5.2, même calcul que le moteur) : 5 jours, raccourcis tout de suite par le moins 8,
 * allongés seulement après 12 cycles avec montée depuis le retrait.
 * La FHM la plus précoce retenue est la plus petite connue (moteur ou statistiques) : jamais plus de jours.
 * @param {object|null} cyc cycle en cours (cyc.pre.earliestFhmDay, cyc.pre.cyclesWithFhmSinceRemoval)
 * @param {number|null} statsEarliest analysis.stats.fhmDay.earliest
 * @returns {{ earliest: number|null, days: number, later: number|null }}
 *   days : jours accordés aujourd'hui si les conditions sont remplies ;
 *   later : nombre (plus grand) possible après 12 cycles avec montée, sinon null
 */
export function previewPreOvulatoryDays(cyc, statsEarliest) {
  const known = [cyc?.pre?.earliestFhmDay, statsEarliest].filter((x) => Number.isFinite(x))
  const earliest = known.length ? Math.min(...known) : null
  if (earliest === null) return { earliest: null, days: 5, later: null }
  const n = Number.isFinite(cyc?.pre?.cyclesWithFhmSinceRemoval) ? cyc.pre.cyclesWithFhmSinceRemoval : 0
  const m8 = earliest - 8
  const dPrev = Math.max(0, (m8 < 5 || n >= 12) ? m8 : 5)
  return { earliest, days: dPrev, later: n < 12 && m8 > 5 ? m8 : null }
}

function rulesCard(ctx) {
  const { data, analysis } = ctx
  const rules = data.rules || {}
  const iudType = data.profile?.iudType ?? null
  const cyc = currentCycle(analysis)
  const strictRecommended = iudType === 'hormonal' || iudType === 'inconnu'
  const currentD = Number.isFinite(analysis?.stats?.currentD) ? analysis.stats.currentD : null
  const earliestFhm = analysis?.stats?.fhmDay?.earliest ?? null

  const learning = switchRow({
    id: 'set-learning-mode',
    label: 'Mode apprentissage',
    checked: rules.learningMode !== 'off',
    hint: h('span', {},
      'Pendant les 3 premiers cycles complets après le retrait, Lune affiche son évaluation mais recommande une protection tous les jours, le temps que tu apprennes à observer.',
      cyc?.flags?.learning ? h('strong', {}, ' Actif pour ton cycle en cours.') : null),
    onChange: async (on, revert) => {
      if (on) {
        ctx.actions.updateRules({ learningMode: 'auto' })
        ctx.ui.toast('Mode apprentissage activé.')
        return
      }
      const ok = await ctx.ui.confirm({
        title: 'Sortir du mode apprentissage ?',
        text: confirmBody('Avant de décider, relis ces points :', [
          'Lune pourra afficher « Pas de protection nécessaire selon les règles » **dès le cycle 1** après le retrait, si le double contrôle est confirmé.',
          'Les premiers cycles après un DIU peuvent être **longs ou sans ovulation** : ils sont plus difficiles à interpréter.',
          'La méthode s\'apprend : il faut en général **environ 3 cycles** d\'observation, idéalement avec une conseillère formée.',
          'Les règles de Lune **n\'ont été validées par aucune étude** ni relues par une conseillère Sensiplan.',
          'Le cycle 0 (jusqu\'à tes premières vraies règles) reste entièrement à protéger, quoi qu\'il arrive.',
        ], 'Tu pourras réactiver ce mode à tout moment.'),
        confirmLabel: 'Désactiver le mode apprentissage',
        danger: true,
      })
      if (!ok) { revert(); return }
      ctx.actions.updateRules({ learningMode: 'off' })
      ctx.ui.toast('Mode apprentissage désactivé.')
    },
  })

  const strict = switchRow({
    id: 'set-strict-fsrh',
    label: 'Mode strict FSRH',
    checked: rules.strictFSRH === true,
    badge: strictRecommended ? h('span', { class: 'badge badge--brand' }, icon('shield', { size: 16 }), h('span', {}, 'Recommandé pour toi')) : null,
    hint: h('span', {},
      richText('Protection tous les jours jusqu\'à ce que 3 cycles soient passés depuis le retrait **et** que tes cycles soient réguliers (critères FIGO). '),
      strictRecommended
        ? h('strong', {}, `Recommandé ici : ton DIU était ${iudType === 'hormonal' ? 'hormonal' : 'de type inconnu'}.`)
        : 'Recommandé si ton DIU était hormonal ou si tu ne connais pas son type.'),
    onChange: async (on, revert) => {
      if (!on && strictRecommended) {
        const ok = await ctx.ui.confirm({
          title: 'Désactiver le mode strict FSRH ?',
          text: confirmBody(`Ton DIU était ${iudType === 'hormonal' ? 'hormonal' : 'de type inconnu'} : la recommandation britannique FSRH conseille d'attendre **3 cycles** et des **cycles réguliers** avant de se fier aux signes de fertilité.`, null,
            'Sans ce mode, Lune peut afficher « Pas de protection nécessaire selon les règles » plus tôt. Tu pourras le réactiver à tout moment.'),
          confirmLabel: 'Désactiver le mode strict',
          danger: true,
        })
        if (!ok) { revert(); return }
      }
      ctx.actions.updateRules({ strictFSRH: on })
      ctx.ui.toast(on ? 'Mode strict FSRH activé.' : 'Mode strict FSRH désactivé.')
    },
  })

  let dInfo = null
  if (rules.preOvulatoryRule && currentD !== null) {
    const reason = currentD === 0 ? (cyc?.pre?.blockedReason || null) : null
    dInfo = statusLine(currentD > 0 ? 'info' : 'neutral', 'calendar',
      h('span', {}, h('strong', {}, `Pour ton cycle en cours : D = ${currentD}`), currentD === 0 ? ' (aucun jour infertile en début de cycle).' : ` (au plus ${days(currentD)} en début de cycle, si ta glaire le permet).`),
      reason ? h('span', { class: 'hint' }, reason) : null)
  }

  const pre = switchRow({
    id: 'set-pre-ovulatory',
    label: 'Jours infertiles en début de cycle (règle des 5 jours / moins 8)',
    checked: rules.preOvulatoryRule === true,
    hint: 'Désactivée par défaut : Lune ne déclare alors jamais de jour infertile avant l\'ovulation. C\'est le réglage le plus prudent.',
    onChange: async (on, revert) => {
      if (!on) {
        ctx.actions.updateRules({ preOvulatoryRule: false })
        ctx.ui.toast('Règle de début de cycle désactivée.')
        return
      }
      const dLine = currentD === null
        ? 'D n\'a pas encore pu être calculé pour ton cycle en cours.'
        : `**D calculé actuellement : ${currentD}.**${currentD === 0 ? ' Il vaut 0 tant que la règle est désactivée.' : ''}`
      const preview = previewPreOvulatoryDays(cyc, earliestFhm)
      const fhmLine = preview.earliest !== null
        ? `Ta montée de température la plus précoce connue est à J${preview.earliest} : la règle accorderait ${days(preview.days)}, si les conditions sont remplies.${preview.later !== null ? ` Après 12 cycles avec montée depuis le retrait, ce nombre pourra passer à ${days(preview.later)}.` : ''}`
        : 'Aucune montée de température confirmée pour l\'instant : au plus 5 jours, si les conditions sont remplies.'
      const ok = await ctx.ui.confirm({
        title: 'Activer la règle de début de cycle ?',
        text: confirmBody('Cette règle peut rendre infertiles les premiers jours du cycle. Ce qu\'il faut savoir :', [
          '**Le risque résiduel de la méthode se situe surtout en début de cycle** (étude italienne citée par Frank-Herrmann 2007).',
          '5 jours en général, moins si ta montée de température la plus précoce est arrivée tôt (règle du moins 8). Après 12 cycles avec montée depuis le retrait, ce peut être plus : ta montée la plus précoce − 8 jours. Lune affiche le nombre réel, appelé D.',
          'Jamais au cycle 0 ni au cycle 1 après le retrait, ni après un cycle sans double contrôle confirmé, déclaré non évaluable ou avec contraception d\'urgence.',
          '**L\'observation prime** : dès la moindre glaire humide ou visible, un spotting ou un jour non observé, ce jour et les suivants redeviennent fertiles.',
          'Il faudra noter ta glaire chaque jour, dès la fin des règles.',
          dLine,
          fhmLine,
        ]),
        confirmLabel: 'Activer la règle',
        danger: true,
      })
      if (!ok) { revert(); return }
      ctx.actions.updateRules({ preOvulatoryRule: true })
      ctx.ui.toast('Règle de début de cycle activée.')
    },
  })

  const copper = iudType === 'cuivre'
    ? switchRow({
      id: 'set-post-hormonal-copper',
      label: 'Valeur haute supplémentaire (DIU au cuivre)',
      checked: rules.postHormonalCopper === true,
      hint: 'Exige une valeur haute de plus pour confirmer la montée de température, comme après une contraception hormonale. Inactive par défaut pour le cuivre, faute de données ; l\'activer est plus prudent.',
      onChange: (on) => {
        ctx.actions.updateRules({ postHormonalCopper: on })
        ctx.ui.toast(on ? 'Valeur haute supplémentaire activée.' : 'Valeur haute supplémentaire désactivée.')
      },
    })
    : null

  return card('set-rules', 'Règles de calcul', 'shield',
    h('p', { class: 'muted' }, RULES_INTRO),
    learning,
    strict,
    strictRecommended && !rules.strictFSRH
      ? statusLine('warn', 'info', 'Pour un DIU hormonal ou de type inconnu, la recommandation britannique FSRH conseille d\'attendre 3 cycles et des cycles réguliers avant de se fier aux signes de fertilité.')
      : null,
    pre,
    dInfo,
    copper,
    h('div', { class: 'v-settings__links' },
      articleLink(ctx, 'apprentissage', 'Les cycles d\'apprentissage'),
      articleLink(ctx, 'decision', 'Comment l\'app décide')))
}

/* ------------------------------------------------------------------ */
/* 3. Affichage                                                        */
/* ------------------------------------------------------------------ */

function displayCard(ctx) {
  const s = ctx.data.settings || {}
  const theme = radioSeg({
    name: 'set-theme', legend: 'Thème', options: THEME_OPTIONS, value: s.theme || 'auto',
    hint: 'Auto suit le réglage clair ou sombre de ton téléphone.',
    onChange: (id) => ctx.actions.updateSettings({ theme: id }),
  })
  const sex = switchRow({
    id: 'set-show-sex',
    label: 'Afficher le suivi des rapports',
    checked: s.showSexLog !== false,
    hint: 'Masqué, il disparaît de la saisie et du calendrier. Les rapports déjà notés sont conservés et restent pris en compte pour les rappels de test.',
    onChange: (on) => ctx.actions.updateSettings({ showSexLog: on }),
  })
  return card('set-display', 'Affichage', 'eye', theme.el, sex)
}

/* ------------------------------------------------------------------ */
/* 4. Sauvegarde                                                       */
/* ------------------------------------------------------------------ */

const PASS_MIN = 10
const DEMO_EXPORT_NOTE = 'Les données de démo ne s\'exportent pas : quitte la démo pour sauvegarder tes vraies données.'
const NO_CRYPTO_NOTE = 'Le chiffrement n\'est pas disponible dans ce navigateur (il faut une page sécurisée, en https) : la sauvegarde chiffrée est impossible ici. Tu peux exporter sans chiffrement ci-dessous, en rangeant le fichier dans un endroit privé.'
const PLAIN_WARNING = 'Le fichier n\'est pas chiffré : range-le dans un endroit privé (Fichiers, cloud personnel).'
const REPORT_LIST_MAX = 6

/** Web Crypto disponible (page sécurisée) ? */
function cryptoAvailable() {
  try {
    const c = globalThis.crypto
    return !!(c && c.subtle && typeof c.getRandomValues === 'function')
  } catch {
    return false
  }
}

/**
 * Vérifie la phrase de passe d'une sauvegarde chiffrée (au moins 10 caractères, saisie deux fois).
 * @param {string} pass
 * @param {string} confirm
 * @returns {string|null} message d'erreur, ou null si elle convient
 */
export function passphraseError(pass, confirm) {
  const p = typeof pass === 'string' ? pass : ''
  if ([...p.trim()].length < PASS_MIN) return `Choisis une phrase de passe d'au moins ${PASS_MIN} caractères.`
  if (p !== confirm) return 'Les deux phrases de passe ne sont pas identiques.'
  return null
}

function dayLabel(iso) {
  const d = fmtDate(iso, 'complet')
  return d === '—' ? `« ${String(iso).slice(0, 20)} »` : d
}

function dayList(isos) {
  const shown = isos.slice(0, REPORT_LIST_MAX).map(dayLabel)
  const more = isos.length - shown.length
  return more > 0 ? `${shown.join(', ')} et ${more} ${plural(more, 'autre')}` : shown.join(', ')
}

/**
 * Traduit le rapport d'import (K8, importJSONDetailed) en décision et en phrases.
 * Un début de règles illisible fait refuser l'import : il fausserait les cycles.
 * @param {{ skippedDays?: string[], lostCycleStarts?: string[], droppedFieldDays?: string[], profileWarnings?: string[] }} report
 * @returns {{ refuse: string|null, notes: string[] }}
 */
export function importReportSummary(report) {
  const r = report || {}
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  const lost = list(r.lostCycleStarts)
  if (lost.length) {
    return {
      refuse: `La sauvegarde contient un début de règles illisible le ${dayList(lost)} : import annulé pour ne pas fausser les cycles.`,
      notes: [],
    }
  }
  const notes = []
  const skipped = list(r.skippedDays)
  const dropped = list(r.droppedFieldDays).filter((iso) => !skipped.includes(iso))
  const n = skipped.length + dropped.length
  if (n > 0) {
    const parts = []
    if (skipped.length) parts.push(`${plural(skipped.length, 'jour écarté', 'jours écartés')} : ${dayList(skipped)}`)
    if (dropped.length) parts.push(`${plural(dropped.length, 'jour', 'jours')} dont une partie n'a pas pu être reprise : ${dayList(dropped)}`)
    notes.push(`**${n} ${plural(n, 'jour ou information ignoré', 'jours ou informations ignorés')} car ${plural(n, 'illisible', 'illisibles')}** (${parts.join(' ; ')}).`)
  }
  if (list(r.profileWarnings).includes('iudRemovalDate')) {
    notes.push('**La date du retrait du stérilet est illisible ou invraisemblable : elle n\'a pas été reprise.** Après l\'import, renseigne-la dans « Mon profil » : sans elle, Lune ne peut pas appliquer les règles de l\'après-retrait.')
  }
  return { refuse: null, notes }
}

/** Champ « phrase de passe » (masqué, sans correction automatique). */
function passInput(id, autocomplete) {
  return h('input', {
    type: 'password', class: 'input', id,
    attrs: { autocomplete, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' },
  })
}

function errorAlert(text) {
  return h('p', { class: 'alert alert--urgent' }, icon('alert', { size: 20 }), h('span', {}, text))
}

/**
 * Feuille d'export chiffré : phrase de passe saisie deux fois, chiffrement, puis remise
 * par un second geste (téléchargement, partage ou copie dans le presse-papiers).
 */
function openEncryptedExport(ctx, { today, onSaved }) {
  const env = ctx.env || {}
  const pass1 = passInput('set-enc-pass', 'new-password')
  const pass2 = passInput('set-enc-pass2', 'new-password')
  const errorBox = h('div', { class: 'v-settings__errors', role: 'alert' })
  const status = h('p', { class: 'hint', role: 'status' })
  const saveSlot = h('div', { class: 'stack stack--sm' })
  let close = () => {}
  const goBtn = h('button', {
    type: 'submit', class: 'btn btn--primary btn--block', id: 'set-enc-go',
  }, icon('lock', { size: 18 }), 'Chiffrer la sauvegarde')

  async function encrypt(e) {
    if (e) e.preventDefault()
    const err = passphraseError(pass1.value, pass2.value)
    errorBox.replaceChildren(...(err ? [errorAlert(err)] : []))
    if (err) return
    goBtn.disabled = true
    status.textContent = 'Chiffrement en cours…'
    let text
    try {
      text = await exportEncrypted(ctx.data, pass1.value)
    } catch (ex) {
      goBtn.disabled = false
      status.textContent = ''
      errorBox.replaceChildren(errorAlert(ex && ex.code === 'NO_CRYPTO' && ex.message
        ? ex.message
        : 'La sauvegarde chiffrée n\'a pas pu être préparée.'))
      return
    }
    pass1.value = ''
    pass2.value = ''
    status.textContent = env.canDownload
      ? 'Sauvegarde chiffrée prête. Enregistre-la maintenant.'
      : 'Sauvegarde chiffrée prête. Dans cet aperçu, tu peux copier son texte pour le garder.'
    saveSlot.replaceChildren(h('button', {
      type: 'button', class: 'btn btn--primary btn--block', id: 'set-enc-save',
      on: {
        click: () => {
          close()
          deliverFile(ctx, {
            name: `lune-sauvegarde-chiffree-${today}.json`,
            type: 'application/json',
            text,
            title: 'Sauvegarde Lune chiffrée',
            onSaved,
          })
        },
      },
    }, icon(env.canDownload ? 'download' : 'copy', { size: 18 }),
    env.canDownload ? 'Enregistrer la sauvegarde chiffrée' : 'Copier le texte chiffré'))
  }

  const form = h('form', { class: 'stack v-settings__sheet', attrs: { novalidate: true }, on: { submit: encrypt } },
    statusLine('warn', 'alert', h('span', {}, richText('**Phrase perdue = sauvegarde irrécupérable** : ni Lune ni personne ne pourra l\'ouvrir sans elle. Note-la ailleurs que la sauvegarde, par exemple dans un gestionnaire de mots de passe.'))),
    field('set-enc-pass', `Phrase de passe (au moins ${PASS_MIN} caractères)`, pass1,
      'Plusieurs mots faciles à retenir pour toi, difficiles à deviner pour les autres.'),
    field('set-enc-pass2', 'Saisis-la une deuxième fois', pass2),
    errorBox,
    goBtn,
    status,
    saveSlot)
  close = ctx.ui.openSheet({ title: 'Sauvegarde chiffrée', content: form, initialFocus: pass1 })
  return { form, pass1, pass2, goBtn, saveSlot, encrypt }
}

/** Feuille de déchiffrement d'une sauvegarde lune-enc, avant l'import. */
function openDecryptImport(ctx, text, onDecrypted) {
  const pass = passInput('set-dec-pass', 'current-password')
  const errorBox = h('div', { class: 'v-settings__errors', role: 'alert' })
  const status = h('p', { class: 'hint', role: 'status' })
  let close = () => {}
  const goBtn = h('button', { type: 'submit', class: 'btn btn--primary btn--block', id: 'set-dec-go' },
    icon('lock', { size: 18 }), 'Ouvrir la sauvegarde')

  async function decrypt(e) {
    if (e) e.preventDefault()
    if (!pass.value) {
      errorBox.replaceChildren(errorAlert('Saisis la phrase de passe choisie lors de l\'export.'))
      return
    }
    goBtn.disabled = true
    errorBox.replaceChildren()
    status.textContent = 'Déchiffrement en cours…'
    let res
    try {
      res = await decryptBackup(text, pass.value, { detailed: true })
    } catch (ex) {
      goBtn.disabled = false
      status.textContent = ''
      errorBox.replaceChildren(errorAlert(ex && ex.message ? ex.message : 'Phrase de passe incorrecte ou fichier abîmé.'))
      return
    }
    pass.value = ''
    close()
    const detailed = res && res.data && res.report ? res : { data: res, report: {} }
    await onDecrypted(detailed)
  }

  const form = h('form', { class: 'stack v-settings__sheet', attrs: { novalidate: true }, on: { submit: decrypt } },
    h('p', {}, 'Cette sauvegarde est chiffrée. Saisis la phrase de passe choisie lors de l\'export.'),
    field('set-dec-pass', 'Phrase de passe', pass),
    errorBox,
    goBtn,
    status)
  close = ctx.ui.openSheet({ title: 'Sauvegarde chiffrée', content: form, initialFocus: pass })
  return { form, pass, goBtn, decrypt }
}

function backupCard(ctx) {
  const { data, env = {}, now } = ctx
  const dayCount = Object.keys(data.days || {}).length
  const isDemo = !!env.isDemo
  const canEncrypt = cryptoAvailable()
  const message = h('div', { class: 'v-settings__message', role: 'alert' })
  const showError = (text) => message.replaceChildren(
    h('div', { class: 'alert alert--urgent' }, icon('alert', { size: 20 }), h('div', {},
      h('p', { class: 'alert__title' }, 'Import impossible'), h('p', {}, text))))

  /* --- État du stockage --- */
  let storageLine
  if (isDemo) {
    storageLine = statusLine('info', 'info', 'Mode démo : rien de ce que tu fais ici n\'est enregistré. Tes données réelles ne sont pas touchées.')
  } else if (env.storageOk) {
    storageLine = statusLine('ok', 'check', 'Enregistrement sur cet appareil : actif.')
  } else {
    storageLine = statusLine('danger', 'alert', h('strong', {}, 'Stockage indisponible sur cet appareil.'),
      h('span', {}, ' Tes saisies seront perdues à la fermeture (navigation privée ?). Exporte une sauvegarde maintenant.'))
  }

  const persistSlot = h('div', { class: 'v-settings__persist' }, statusLine('neutral', 'clock', 'Vérification de la protection des données…'))
  if (!env.isArtifact) {
    persistenceStatus().then((status) => {
      if (persistSlot.isConnected) persistSlot.replaceChildren(...persistContent(ctx, status))
    }, () => {
      if (persistSlot.isConnected) persistSlot.replaceChildren(...persistContent(ctx, null))
    })
  } else {
    persistSlot.replaceChildren(statusLine('info', 'info', 'Dans cet aperçu, les données ne sont pas conservées durablement : exporte-les si tu veux les garder.'))
  }

  /* --- Dernière sauvegarde --- */
  const last = data.settings?.lastExportAt || null
  let lastLine
  if (!last) {
    lastLine = statusLine('warn', 'alert', 'Aucune sauvegarde exportée pour l\'instant.')
  } else {
    const ago = diffDays(last, now.today)
    const when = ago === 0 ? 'aujourd\'hui' : ago === 1 ? 'hier' : `il y a ${ago} jours`
    lastLine = statusLine(ago !== null && ago > BACKUP_STALE_DAYS ? 'warn' : 'ok', ago > BACKUP_STALE_DAYS ? 'alert' : 'check',
      `Dernière sauvegarde : ${fmtDate(last, 'complet')} (${when}).`)
  }

  /** Remise réussie : seulement alors la sauvegarde compte (jamais en démo). */
  const savedWith = (encrypted) => () => {
    if (ctx.env?.isDemo) return
    ctx.actions.markExported()
    ctx.ui.toast(encrypted
      ? 'Sauvegarde chiffrée prête. Garde-la en lieu sûr, et ta phrase de passe ailleurs.'
      : 'Sauvegarde prête. Garde-la en lieu sûr.')
  }

  /* --- Export chiffré (par défaut) --- */
  const exportBtn = h('button', {
    type: 'button', class: 'btn btn--primary btn--block', id: 'set-export-json',
    disabled: isDemo || !canEncrypt,
    ariaDescribedby: isDemo ? 'set-export-demo' : null,
    on: {
      click: () => {
        if (ctx.env?.isDemo) return
        if (!cryptoAvailable()) {
          ctx.ui.toast(NO_CRYPTO_NOTE)
          return
        }
        openEncryptedExport(ctx, { today: now.today, onSaved: savedWith(true) })
      },
    },
  }, icon('lock', { size: 20 }), 'Exporter une sauvegarde chiffrée')

  /* --- Export en clair (option secondaire) --- */
  const plainBtn = h('button', {
    type: 'button', class: 'btn btn--block', id: 'set-export-plain',
    disabled: isDemo,
    ariaDescribedby: isDemo ? 'set-export-demo' : 'set-export-plain-hint',
    on: {
      click: () => {
        if (ctx.env?.isDemo) return
        let text
        try {
          text = exportJSON(ctx.data)
        } catch {
          ctx.ui.toast('La sauvegarde n\'a pas pu être préparée.')
          return
        }
        deliverFile(ctx, {
          name: `lune-sauvegarde-${now.today}.json`,
          type: 'application/json',
          text,
          title: 'Sauvegarde Lune (non chiffrée)',
          onSaved: savedWith(false),
        })
      },
    },
  }, icon('download', { size: 20 }), 'Exporter une sauvegarde non chiffrée (.json)')

  /* --- Import --- */
  async function confirmImport({ data: appData, report }) {
    const summary = importReportSummary(report)
    if (summary.refuse) {
      showError(summary.refuse)
      return
    }
    const isos = Object.keys(appData.days || {}).sort()
    const content = isos.length
      ? `La sauvegarde contient ${isos.length} ${plural(isos.length, 'jour noté', 'jours notés')}, du ${fmtDate(isos[0], 'complet')} au ${fmtDate(isos[isos.length - 1], 'complet')}.`
      : 'La sauvegarde ne contient aucun jour noté (seulement le profil et les réglages).'
    const replaced = ctx.env?.isDemo
      ? 'Tu quitteras la démo, et ces données **remplaceront toutes les données réelles** de cet appareil.'
      : `Elles **remplaceront toutes les données actuelles** de cet appareil (${dayCount} ${plural(dayCount, 'jour noté', 'jours notés')}).`
    const ok = await ctx.ui.confirm({
      title: 'Remplacer toutes les données ?',
      text: confirmBody(content, summary.notes, `${replaced} C'est irréversible : exporte d'abord une sauvegarde si tu as un doute.`),
      confirmLabel: 'Remplacer mes données',
      danger: true,
    })
    if (!ok) return
    ctx.actions.importData(appData)
    ctx.ui.toast('Sauvegarde importée.')
  }

  async function importText(text) {
    message.replaceChildren()
    let result
    try {
      result = importJSONDetailed(text)
    } catch (err) {
      if (err && err.code === 'ENCRYPTED') {
        if (!cryptoAvailable()) {
          showError('Cette sauvegarde est chiffrée, mais le chiffrement n\'est pas disponible dans ce navigateur : ouvre-la dans un navigateur à jour, sur une page sécurisée (https).')
          return
        }
        openDecryptImport(ctx, text, confirmImport)
        return
      }
      showError(err && err.message ? err.message : 'Ce fichier n\'a pas pu être lu.')
      return
    }
    await confirmImport(result)
  }

  const fileInput = h('input', {
    type: 'file', id: 'set-import-file', class: 'sr-only', tabIndex: -1, ariaHidden: 'true',
    accept: '.json,application/json',
    on: {
      change: (e) => {
        const input = e.currentTarget
        const file = input.files && input.files[0]
        input.value = ''
        if (!file) return
        if (file.size > IMPORT_MAX_BYTES) {
          showError('Ce fichier est trop volumineux pour être une sauvegarde Lune.')
          return
        }
        const reader = new FileReader()
        reader.onload = () => importText(String(reader.result || ''))
        reader.onerror = () => showError('Le fichier n\'a pas pu être lu.')
        reader.readAsText(file)
      },
    },
  })
  const importBtn = h('button', {
    type: 'button', class: 'btn btn--block', id: 'set-import-json',
    on: { click: () => fileInput.click() },
  }, icon('upload', { size: 20 }), 'Importer une sauvegarde')

  const pasteBtn = !env.canDownload
    ? h('button', {
      type: 'button', class: 'btn btn--ghost btn--block', id: 'set-import-paste',
      on: { click: () => openPasteImport(ctx, importText) },
    }, icon('copy', { size: 20 }), 'Coller le texte d\'une sauvegarde')
    : null

  /* --- CSV --- */
  const csvBtn = h('button', {
    type: 'button', class: 'btn btn--block', id: 'set-export-csv',
    ariaDescribedby: 'set-export-csv-hint',
    on: {
      click: () => {
        deliverFile(ctx, {
          name: `lune-donnees-${now.today}.csv`,
          type: 'text/csv;charset=utf-8',
          text: exportCSV(ctx.data),
          title: 'Données Lune (tableur)',
        })
      },
    },
  }, icon('chart', { size: 20 }), 'Exporter en CSV (tableur)')

  /* --- Effacement --- */
  const resetBlock = isDemo ? null : h('div', { class: 'stack stack--sm v-settings__danger' },
    h('h3', { class: 'label' }, 'Zone sensible'),
    h('button', {
      type: 'button', class: 'btn btn--danger btn--block', id: 'set-reset-all',
      on: {
        click: async () => {
          const first = await ctx.ui.confirm({
            title: 'Tout effacer ?',
            text: confirmBody(`Toutes tes données seront supprimées de cet appareil : ${dayCount} ${plural(dayCount, 'jour noté', 'jours notés')}, ton profil et tes réglages.`, null,
              'Exporte d\'abord une sauvegarde si tu veux pouvoir les retrouver.'),
            confirmLabel: 'Continuer',
            danger: true,
          })
          if (!first) return
          const second = await ctx.ui.confirm({
            title: 'Dernière vérification',
            text: 'C\'est **définitif** : Lune ne pourra pas récupérer tes données.',
            confirmLabel: 'Effacer définitivement',
            danger: true,
          })
          if (!second) return
          let cleared = false
          try {
            cleared = (await ctx.actions.resetAll()) === true
          } catch {
            cleared = false
          }
          ctx.ui.toast(cleared
            ? 'Toutes les données ont été effacées.'
            : 'L\'effacement n\'a pas pu être confirmé sur cet appareil. Réessaie, ou supprime les données du site dans les réglages du navigateur.')
        },
      },
    }, icon('trash', { size: 20 }), 'Tout effacer'))

  return card('set-backup', 'Sauvegarde', 'download',
    h('p', { class: 'muted' }, 'Tes données ne sont que sur ce téléphone. Personne d\'autre ne peut les récupérer pour toi : une sauvegarde régulière est ta seule assurance.'),
    h('div', { class: 'stack stack--sm' }, storageLine, persistSlot, lastLine),
    statusLine('warn', 'phone', h('strong', {}, 'Sur iPhone, supprimer l\'icône de l\'app peut effacer tes données : exporte régulièrement.')),
    h('div', { class: 'stack stack--sm' },
      exportBtn,
      isDemo
        ? h('p', { class: 'hint', id: 'set-export-demo' }, DEMO_EXPORT_NOTE)
        : h('p', { class: 'hint' }, canEncrypt
          ? 'Le fichier est protégé par une phrase de passe que tu choisis : sans elle, personne ne peut le lire.'
          : NO_CRYPTO_NOTE),
      importBtn, fileInput, pasteBtn,
      message,
      h('details', { class: 'v-settings__details', id: 'set-export-plain-details', open: !canEncrypt && !isDemo },
        h('summary', {}, 'Exports non chiffrés (JSON, tableur CSV)'),
        h('div', { class: 'stack stack--sm' },
          plainBtn,
          h('p', { class: 'hint', id: 'set-export-plain-hint' }, PLAIN_WARNING),
          csvBtn,
          h('p', { class: 'hint', id: 'set-export-csv-hint' }, `${PLAIN_WARNING} Le tableur sert à lire tes données, pas à les réimporter.`)))),
    resetBlock)
}

function persistContent(ctx, status) {
  if (status === true) {
    return [statusLine('ok', 'lock', 'Données protégées contre l\'effacement automatique par le navigateur.')]
  }
  if (status === null) {
    return [statusLine('neutral', 'info', 'Ton navigateur ne permet pas de vérifier la protection contre l\'effacement. Exporte régulièrement.')]
  }
  const btn = h('button', {
    type: 'button', class: 'btn btn--block', id: 'set-request-persist',
    on: {
      click: async (e) => {
        e.currentTarget.disabled = true
        let granted = null
        try {
          granted = await ctx.actions.requestPersistence()
        } catch {
          granted = null
        }
        if (granted === true) ctx.ui.toast('C\'est fait : tes données sont protégées contre l\'effacement automatique.')
        else if (granted === false) ctx.ui.toast('Le navigateur a refusé pour l\'instant. Installer l\'app sur l\'écran d\'accueil aide souvent. Continue d\'exporter.')
        else ctx.ui.toast('Ton navigateur ne propose pas cette protection. Exporte régulièrement.')
      },
    },
  }, icon('lock', { size: 20 }), 'Protéger mes données contre l\'effacement')
  return [
    statusLine('warn', 'alert', 'Le navigateur peut effacer tes données s\'il manque de place.'),
    btn,
  ]
}

function openPasteImport(ctx, importText) {
  const area = h('textarea', {
    class: 'input mono v-settings__export-text', id: 'set-import-text', rows: 8,
    attrs: { spellcheck: 'false', autocomplete: 'off' },
  })
  const close = ctx.ui.openSheet({
    title: 'Coller une sauvegarde',
    content: h('div', { class: 'stack v-settings__sheet' },
      field('set-import-text', 'Texte de la sauvegarde', area, 'Colle ici le texte exporté depuis Lune (il commence par « { »).'),
      h('button', {
        type: 'button', class: 'btn btn--primary btn--block',
        on: { click: () => { const text = area.value; close(); importText(text) } },
      }, icon('upload', { size: 18 }), 'Importer ce texte')),
  })
}

/* ------------------------------------------------------------------ */
/* 5. Rappels                                                          */
/* ------------------------------------------------------------------ */

function remindersCard(ctx) {
  const { data, env = {}, now } = ctx
  const saved = data.settings?.reminderTime || null
  const fallback = data.profile?.usualWakeTime || '07:00'
  const timeInput = h('input', {
    type: 'time', class: 'input', id: 'set-reminder-time', value: saved || fallback,
    ariaDescribedby: 'set-reminder-time-hint',
    on: {
      change: (e) => {
        const val = e.currentTarget.value
        if (!TIME_RE.test(val) || val === saved) return
        ctx.actions.updateSettings({ reminderTime: val })
        ctx.ui.toast(`Heure du rappel enregistrée : ${val}.`)
      },
    },
  })

  const icsBtn = env.canDownload
    ? h('button', {
      type: 'button', class: 'btn btn--block', id: 'set-reminder-ics',
      on: {
        click: () => {
          const time = TIME_RE.test(timeInput.value) ? timeInput.value : fallback
          const startDate = time > now.time ? now.today : addDays(now.today, 1)
          const stamp = utcStamp(new Date())
          const text = buildReminderICS({ time, startDate, stamp, uid: `lune-rappel-${stamp}@lune.local` })
          try {
            downloadText('rappel-du-matin.ics', 'text/calendar;charset=utf-8', text)
            if (time !== saved) ctx.actions.updateSettings({ reminderTime: time })
            ctx.ui.toast('Ouvre le fichier pour ajouter le rappel à ton agenda.')
          } catch {
            ctx.ui.toast('Le fichier n\'a pas pu être créé sur cet appareil.')
          }
        },
      },
    }, icon('calendar', { size: 20 }), 'Ajouter un rappel quotidien à mon calendrier (.ics)')
    : null

  const iosSteps = [
    'Ouvre l\'app **Raccourcis**, onglet **Automatisation**.',
    'Touche **Nouvelle automatisation**, puis **Heure de la journée**.',
    'Choisis ton heure de réveil, **Quotidien**, puis **Exécuter immédiatement**.',
    'Ajoute l\'action **Ouvrir l\'app** (choisis Lune) ou **Afficher une notification** avec un texte neutre comme « Rappel du matin ».',
  ]

  return card('set-reminders', 'Rappels', 'bell',
    h('p', { class: 'muted' }, 'Lune n\'a pas de serveur : elle ne peut pas t\'envoyer de notification. Voici des solutions qui fonctionnent sans elle, au texte neutre et sans donnée de santé.'),
    field('set-reminder-time', 'Heure du rappel', timeInput, 'Idéalement ton heure de réveil : mesure ta température avant de te lever.'),
    icsBtn,
    icsBtn ? h('p', { class: 'hint' }, 'Le fichier crée un événement quotidien « Rappel du matin » avec une alerte. Sur Google Agenda, l\'import d\'un .ics ne se fait que depuis un ordinateur.') : null,
    h('details', { class: 'v-settings__details', open: env.platform === 'ios' },
      h('summary', {}, 'Sur iPhone : une automatisation Raccourcis'),
      h('ol', { class: 'v-settings__list v-settings__list--steps' }, iosSteps.map((t) => h('li', {}, richText(t))))),
    h('details', { class: 'v-settings__details' },
      h('summary', {}, 'Avec le réveil de ton téléphone'),
      h('p', {}, richText('Crée une alarme répétée **tous les jours** à ton heure de réveil, nommée « Rappel du matin ». Garde le thermomètre à portée de main pour mesurer avant de te lever.'))))
}

/* ------------------------------------------------------------------ */
/* 6. Résumé pour un·e soignant·e                                      */
/* ------------------------------------------------------------------ */

function dl(rows) {
  return h('dl', { class: 'v-settings-summary__dl' },
    rows.filter(Boolean).map(([k, val]) => h('div', {}, h('dt', {}, k), h('dd', {}, val))))
}

function cycleLabel(c) {
  if (c.isCycle0) return 'Cycle 0'
  if (Number.isInteger(c.postRemovalNumber)) return `Cycle ${c.postRemovalNumber}`
  return `N° ${c.index + 1}`
}

function cycleRemarks(c, isCurrent) {
  const out = []
  if (c.isCycle0) out.push('début inconnu (avant les 1res règles)')
  if (isCurrent) out.push('en cours')
  if (c.flags?.emergencyContraception) out.push('contraception d\'urgence')
  if (c.flags?.unevaluable) out.push('non évaluable')
  if (c.flags?.atypical) out.push('atypique')
  if (c.end && c.temp?.state === 'aucune_montee') out.push('sans montée thermique confirmée')
  return out.join(', ') || '—'
}

/** Comptage des symptômes, humeurs, douleurs et spottings sur une période. */
function symptomStats(data, from, to) {
  const symptoms = new Map()
  const moods = new Map()
  const pains = []
  let spotting = 0
  let observed = 0
  for (const [iso, d] of Object.entries(data.days || {})) {
    if (iso < from || iso > to || !d) continue
    observed++
    for (const s of d.symptoms || []) symptoms.set(s, (symptoms.get(s) || 0) + 1)
    for (const m of d.moods || []) moods.set(m, (moods.get(m) || 0) + 1)
    if (Number.isInteger(d.pain)) pains.push(d.pain)
    if (d.bleeding === 'spotting') spotting++
  }
  const top = (map, list, n) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, count]) => [list.find((x) => x.id === id)?.label ?? id.replace(/_/g, ' '), count])
  return { observed, spotting, pains, symptoms: top(symptoms, SYMPTOMS, 8), moods: top(moods, MOODS, 5) }
}

/**
 * Feuille récapitulative (aperçu à l'écran et version imprimée).
 * @returns {HTMLElement}
 */
function buildSummary(ctx) {
  const { data, analysis, now } = ctx
  const p = data.profile || {}
  const stats = analysis?.stats || null
  const cycles = Array.isArray(analysis?.cycles) ? analysis.cycles : []
  const curIndex = analysis?.current?.cycleIndex ?? null
  const routeLabel = TEMP_ROUTES.find((r) => r.id === p.tempRoute)?.label ?? '—'

  const context = dl([
    ['DIU retiré', p.iudType ? `${IUD_LABELS[p.iudType]}${p.iudModel ? ` (${p.iudModel})` : ''}` : 'Pas de DIU retiré récemment'],
    p.iudType && p.iudRemovalDate ? ['Date du retrait', `${fmtDate(p.iudRemovalDate, 'complet')}${p.iudRemovalTime ? ` à ${p.iudRemovalTime.replace(':', ' h ')}` : ''}`] : null,
    p.birthYear ? ['Année de naissance', String(p.birthYear)] : null,
    ['Température', `voie ${routeLabel.toLowerCase()}, au réveil`],
    ['Signe associé', p.secondarySign === 'col' ? 'col de l\'utérus' : 'glaire cervicale'],
  ])

  const cl = stats?.cycleLength
  const pl = stats?.periodLength
  const hp = stats?.highPhase
  const fhm = stats?.fhmDay
  const reg = stats?.regularity
  const statsBlock = stats && stats.validCycles > 0
    ? dl([
      ['Cycles complets utilisés', String(stats.validCycles)],
      cl ? ['Durée du cycle', `moyenne ${days(cl.mean)} · médiane ${fmtNum(cl.median)} · de ${fmtNum(cl.min)} à ${fmtNum(cl.max)} · écart-type ${fmtNum(cl.sd)}`] : null,
      pl ? ['Durée des règles', `moyenne ${days(pl.mean)} · de ${fmtNum(pl.min)} à ${fmtNum(pl.max)}`] : null,
      hp ? ['Phase haute (température)', `moyenne ${days(hp.mean)} · de ${fmtNum(hp.min)} à ${fmtNum(hp.max)} · ${hp.n} ${plural(hp.n, 'cycle')}`] : null,
      fhm ? ['1re température haute', `la plus précoce à J${fmtNum(fhm.earliest)} · en moyenne J${fmtNum(fhm.mean)}`] : null,
      reg ? ['Régularité (FIGO)', `${REGULARITY_LABELS[reg.status] ?? '—'}${Number.isFinite(reg.spread) ? ` · écart entre cycles ${days(reg.spread)}` : ''}${Number.isFinite(reg.threshold) ? ` (seuil ${fmtNum(reg.threshold)})` : ''}`] : null,
    ])
    : h('p', {}, 'Pas encore assez de cycles complets pour calculer des statistiques.')

  const shown = cycles.slice(-SUMMARY_MAX_CYCLES).reverse()
  const table = shown.length
    ? h('table', { class: 'v-settings-summary__table' },
      h('thead', {}, h('tr', {}, ['Cycle', 'Début', 'Durée', 'Règles', '1re T° haute', 'Phase haute', 'Remarques'].map((t) => h('th', { attrs: { scope: 'col' } }, t)))),
      h('tbody', {}, shown.map((c) => {
        const isCurrent = c.index === curIndex
        return h('tr', {},
          h('th', { attrs: { scope: 'row' } }, cycleLabel(c)),
          h('td', {}, fmtDate(c.start, 'court') + ' ' + c.start.slice(0, 4)),
          h('td', {}, Number.isFinite(c.length) ? `${c.length} j` : `${c.dayCount ?? '—'} j${isCurrent ? ' (en cours)' : ''}`),
          h('td', {}, c.periodLength ? `${c.periodLength} j` : '—'),
          h('td', {}, c.temp?.fhmCycleDay ? `J${c.temp.fhmCycleDay}` : '—'),
          h('td', {}, Number.isFinite(c.highPhaseLength) ? `${c.highPhaseLength} j` : '—'),
          h('td', {}, cycleRemarks(c, isCurrent)))
      })))
    : h('p', {}, 'Aucun cycle enregistré.')

  const from = addDays(now.today, -(SUMMARY_SYMPTOM_DAYS - 1))
  const sym = symptomStats(data, from, now.today)
  const painMax = sym.pains.length ? Math.max(...sym.pains) : null
  const painMean = sym.pains.length ? sym.pains.reduce((a, b) => a + b, 0) / sym.pains.length : null
  const strong = sym.pains.filter((x) => x >= 7).length
  const symptomsBlock = sym.observed
    ? h('div', { class: 'stack stack--sm' },
      h('p', {}, `Sur les 6 derniers mois (depuis le ${fmtDate(from, 'complet')}), ${sym.observed} ${plural(sym.observed, 'jour noté', 'jours notés')}.`),
      dl([
        ['Symptômes les plus fréquents', sym.symptoms.length ? sym.symptoms.map(([l, n]) => `${l} (${days(n)})`).join(' · ') : 'aucun noté'],
        ['Douleur (0 à 10)', sym.pains.length
          ? `notée ${days(sym.pains.length)} · moyenne ${fmtNum(painMean)} · maximum ${painMax}${strong ? ` · ${days(strong)} à 7 ou plus` : ''}`
          : 'non notée'],
        ['Spotting hors règles', sym.spotting ? days(sym.spotting) : 'aucun noté'],
        sym.moods.length ? ['Humeurs les plus fréquentes', sym.moods.map(([l, n]) => `${l} (${days(n)})`).join(' · ')] : null,
      ]))
    : h('p', {}, 'Aucun jour noté sur les 6 derniers mois.')

  const alerts = (analysis?.alerts || []).filter((a) => a && a.level !== 'info')
  const alertsBlock = alerts.length
    ? h('section', { class: 'stack stack--sm' },
      h('h3', {}, 'Points signalés par l\'app'),
      h('ul', { class: 'v-settings__list' }, alerts.map((a) => h('li', {}, h('strong', {}, a.title), a.text ? ` — ${a.text}` : ''))))
    : null

  return h('article', { class: 'v-settings-summary stack' },
    h('header', { class: 'stack stack--sm' },
      h('h2', { class: 'display v-settings-summary__title' }, 'Résumé de cycle'),
      h('p', {}, `Établi avec Lune le ${fmtDate(now.today, 'complet')}, à partir des observations notées par la personne suivie.`),
      h('p', { class: 'v-settings-summary__warn' }, 'Lune n\'est pas un dispositif médical : son évaluation des cycles n\'a été validée par aucune étude.')),
    h('section', { class: 'stack stack--sm' }, h('h3', {}, 'Contexte'), context),
    h('section', { class: 'stack stack--sm' }, h('h3', {}, 'Statistiques'), statsBlock),
    h('section', { class: 'stack stack--sm' }, h('h3', {}, `Cycles${cycles.length > SUMMARY_MAX_CYCLES ? ` (${SUMMARY_MAX_CYCLES} plus récents)` : ''}`), table),
    h('section', { class: 'stack stack--sm' }, h('h3', {}, 'Symptômes'), symptomsBlock),
    alertsBlock,
    h('p', { class: 'v-settings-summary__foot' }, 'Courbes de température et observations jour par jour : écran « Cycles » de l\'app ou export CSV. Les rapports ne figurent pas dans ce résumé.'))
}

function removePrintRoot() {
  document.documentElement.classList.remove(PRINT_CLASS)
  for (const el of document.querySelectorAll('.v-settings-print')) el.remove()
}

function printSummary(ctx) {
  removePrintRoot()
  const root = h('div', { class: 'v-settings-print' }, buildSummary(ctx))
  document.body.appendChild(root)
  document.documentElement.classList.add(PRINT_CLASS)
  window.addEventListener('afterprint', removePrintRoot, { once: true })
  try {
    window.print()
  } catch {
    removePrintRoot()
    ctx.ui.toast('L\'impression n\'est pas disponible ici.')
  }
}

function summaryCard(ctx) {
  if (!ctx.env?.canPrint) return null
  const open = () => {
    ctx.ui.openSheet({
      title: 'Résumé pour un·e soignant·e',
      content: h('div', { class: 'stack v-settings__sheet' },
        h('button', {
          type: 'button', class: 'btn btn--primary btn--block', id: 'set-print-go',
          on: { click: () => printSummary(ctx) },
        }, icon('download', { size: 20 }), 'Imprimer ou enregistrer en PDF'),
        h('div', { class: 'v-settings__preview' }, buildSummary(ctx))),
      onClose: removePrintRoot,
    })
  }
  return card('set-summary', 'Résumé pour un·e soignant·e', 'chart',
    h('p', { class: 'muted' }, 'Une page à montrer à ton médecin, ta sage-femme ou ta conseillère : cycles, durées, statistiques et symptômes fréquents.'),
    h('button', { type: 'button', class: 'btn btn--block', id: 'set-print', on: { click: open } },
      icon('book', { size: 20 }), 'Imprimer / PDF'))
}

/* ------------------------------------------------------------------ */
/* 7 à 9. Démo, introduction, à propos                                 */
/* ------------------------------------------------------------------ */

function demoCard(ctx) {
  const isDemo = !!ctx.env?.isDemo
  return card('set-demo', 'Démonstration', 'sparkle',
    h('p', { class: 'muted' }, isDemo
      ? 'Tu regardes des données fictives. Tes vraies données ne sont ni affichées ni modifiées.'
      : 'Découvre Lune avec des cycles fictifs réalistes. Tes données réelles restent intactes et reviennent quand tu quittes la démo.'),
    h('button', {
      type: 'button', class: ['btn', 'btn--block', isDemo && 'btn--primary'], id: 'set-demo-toggle',
      on: { click: () => (isDemo ? ctx.actions.exitDemo() : ctx.actions.loadDemo()) },
    }, icon(isDemo ? 'x' : 'eye', { size: 20 }), isDemo ? 'Quitter la démo' : 'Voir la démo'))
}

function introCard(ctx) {
  return card('set-intro', 'Introduction', 'home',
    h('p', { class: 'muted' }, 'Installation sur l\'écran d\'accueil, avertissements et conseils pour l\'après-retrait.'),
    h('button', {
      type: 'button', class: 'btn btn--block', id: 'set-onboarding',
      on: { click: () => ctx.navigate('onboarding') },
    }, icon('chevron-right', { size: 20 }), 'Revoir l\'introduction'))
}

function aboutCard(ctx) {
  const paragraphs = Array.isArray(TEXTS?.disclaimerLong) ? TEXTS.disclaimerLong : []
  return card('set-about', 'À propos', 'info',
    statusLine('ok', 'lock', h('strong', {}, 'Aucune donnée ne quitte ton téléphone.'),
      h('span', {}, ' Pas de compte, pas d\'analytique, pas de serveur.')),
    h('div', { class: 'stack stack--sm v-settings__prose' }, paragraphs.map((t) => h('p', {}, richText(t)))),
    h('div', { class: 'v-settings__links' },
      articleLink(ctx, 'efficacite', 'Efficacité des contraceptions'),
      articleLink(ctx, 'ressources', 'Ressources en France')),
    h('p', { class: 'hint mono' }, `Lune ${APP_VERSION} · format de données ${SCHEMA}`))
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

/**
 * Affiche la vue « Réglages ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 * @returns {() => void} nettoyage (retire une éventuelle version imprimable)
 */
export function render(root, ctx) {
  root.classList.add('v-settings')
  const sections = [
    h('header', { class: 'v-settings__head' },
      h('p', { class: 'eyebrow' }, 'Ton espace'),
      h('h1', { class: 'display v-settings__h1' }, 'Réglages')),
    profileCard(ctx),
    rulesCard(ctx),
    displayCard(ctx),
    backupCard(ctx),
    remindersCard(ctx),
    summaryCard(ctx),
    demoCard(ctx),
    introCard(ctx),
    aboutCard(ctx),
  ]
  root.append(...sections.filter(Boolean))
  return () => {
    if (!document.querySelector('.sheet-layer')) removePrintRoot()
  }
}
