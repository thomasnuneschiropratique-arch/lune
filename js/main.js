// Bootstrap de Lune : environnement, chargement des données, coque, routeur,
// analyse, actions, mode démo, rafraîchissements horaires, service worker.
// Importable sous Node : rien ne touche le navigateur avant l'appel de start().

import { analyze } from './engine/index.js'
import { h, icon, logoSvg, fmtDate, todayParts } from './ui/dom.js'
import { createUI } from './ui/sheet.js'
import {
  loadData, loadDataAsync, saveDataDetailed, normalizeDay, normalizeData, defaultData,
  storageAvailable, clearAll, exportJSON, requestPersistence as storeRequestPersistence,
  peekRev, isDayKey, isImplausibleRemovalDate,
} from './store.js'
import { generateDemo } from './demo-data.js'
import * as todayView from './ui/views/today.js'
import * as logView from './ui/views/log.js'
import * as calendarView from './ui/views/calendar.js'
import * as cyclesView from './ui/views/cycles.js'
import * as learnView from './ui/views/learn.js'
import * as settingsView from './ui/views/settings.js'
import * as onboardingView from './ui/views/onboarding.js'
import * as urgenceView from './ui/views/urgence.js'

const VIEWS = {
  aujourdhui: todayView,
  calendrier: calendarView,
  noter: logView,
  cycles: cyclesView,
  comprendre: learnView,
  reglages: settingsView,
  onboarding: onboardingView,
  urgence: urgenceView,
}
const ROUTE_LABELS = {
  aujourdhui: 'Aujourd\'hui',
  calendrier: 'Calendrier',
  noter: 'Noter',
  cycles: 'Cycles',
  comprendre: 'Comprendre',
  reglages: 'Réglages',
  onboarding: 'Bienvenue',
  urgence: 'Urgence',
}
const DEFAULT_ROUTE = 'aujourdhui'
// Paramètre positionnel reflété dans le hash (#noter/2026-10-05) et son validateur.
const ROUTE_PARAM = {
  noter: { key: 'date', parse: (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) },
  cycles: { key: 'cycle', parse: (s) => (/^\d{1,4}$/.test(s) ? Number(s) : null) },
  comprendre: { key: 'article', parse: (s) => (/^[a-z0-9_-]{1,80}$/i.test(s) ? s : null) },
  urgence: { key: 'date', parse: (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) },
}
const TABS = [
  { name: 'aujourdhui', label: 'Aujourd\'hui', icon: 'sunrise' },
  { name: 'calendrier', label: 'Calendrier', icon: 'calendar' },
  { name: 'noter', label: 'Noter', icon: 'plus', accent: true },
  { name: 'cycles', label: 'Cycles', icon: 'chart' },
  { name: 'comprendre', label: 'Comprendre', icon: 'book' },
]
// Routes accessibles avant la fin du premier lancement.
const PRE_ONBOARDING_ROUTES = new Set(['onboarding', 'urgence', 'comprendre'])
// Routes de saisie : pas de re-rendu automatique (on ne veut pas effacer un formulaire en cours).
const INPUT_ROUTES = new Set(['noter', 'onboarding'])
// Routes qui affichent une décision : jamais rendues si l'analyse a échoué.
const DECISION_ROUTES = new Set(['aujourdhui', 'calendrier', 'cycles'])
const INFERTILE_STATES = new Set(['INFERTILE_PRE', 'INFERTILE_POST'])
const PERIOD_BLEEDING = new Set(['leger', 'moyen', 'abondant'])
// Ciels de phase (css/app.css, [data-phase] sur <html>) ; décor seulement, jamais une décision.
const SKY_PHASES = new Set(['regles', 'folliculaire', 'ovulatoire', 'luteale', 'inconnue'])
const BACKUP_REMINDER_DAYS = 7
const LS_DATA_KEY = 'lune:data:v1'
const LS_RESET_KEY = 'lune:reset:v1'

const state = {
  data: null,
  isDemo: false,
  demoFromArtifact: false,
  analysis: null,
  analysisError: null,
  now: null,
  route: { name: DEFAULT_ROUTE, params: {} },
  env: null,
  ui: null,
  shell: null,
  cleanup: null,
  lastSlot: null,
  timer: null,
  saveFailed: false,
  rendering: false,
  renderQueued: null,
  pendingRegression: null,
  rev: 0, // révision des données en mémoire (voir store.peekRev)
  leaveGuard: null, // K7 : fn() → true si une saisie n'est pas enregistrée
  routeSeq: 0, // K7 : incrémenté à chaque vraie entrée sur une route
  lastToday: null, // date du dernier rendu (changement de jour sur une route de saisie)
  notices: { external: false, dayChange: null, update: null, reloadReady: false },
  swReloading: false,
  swRegistration: null,
  updateAccepted: false,
  clock: () => new Date(),
}

// ---------------------------------------------------------------------------
// Utilitaires

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

function computeNow() {
  const { today, time } = todayParts(state.clock())
  return { today, time }
}

/** Tranche horaire pertinente pour le moteur : la date et avant / après 18:00. */
function slotOf(now) {
  return `${now.today}|${now.time >= '18:00' ? 'soir' : 'jour'}`
}

function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

function cls(...names) {
  return names.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Environnement

function detectEnv() {
  const w = window
  const nav = w.navigator || {}
  const isArtifact = !!w.__LUNE_ENV__?.artifact
  let isStandalone = false
  try {
    isStandalone = (typeof w.matchMedia === 'function' && w.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
  } catch {
    isStandalone = nav.standalone === true
  }
  const ua = nav.userAgent || ''
  let platform = 'autre'
  if (/iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) platform = 'ios'
  else if (/Android/i.test(ua)) platform = 'android'
  return {
    isDemo: false,
    isArtifact,
    isStandalone,
    canDownload: !isArtifact,
    canPrint: !isArtifact,
    canShare: !!nav.share,
    storageOk: storageAvailable(),
    platform,
  }
}

function applyTheme() {
  const root = document.documentElement
  const theme = state.data?.settings?.theme
  if (theme === 'clair' || theme === 'sombre') root.dataset.theme = theme
  else delete root.dataset.theme
}

/**
 * Phase indicative du jour courant, pour le ciel (décor) : 'inconnue' si l'analyse manque.
 * @param {object|null} analysis
 * @returns {'regles'|'folliculaire'|'ovulatoire'|'luteale'|'inconnue'}
 */
export function skyPhaseOf(analysis) {
  const phase = analysis?.current?.status?.phase
  return SKY_PHASES.has(phase) ? phase : 'inconnue'
}

/** Pose data-phase sur <html> (ciel et lavis de la phase) puis accorde la barre du navigateur. */
function applyPhase() {
  const root = document.documentElement
  const phase = state.analysisError ? 'inconnue' : skyPhaseOf(state.analysis)
  if (root.dataset.phase !== phase) root.dataset.phase = phase
  updateThemeColor()
}

/** meta theme-color = lavis du haut d'écran (--wash), selon le thème et la phase. Best effort. */
function updateThemeColor() {
  try {
    const wash = getComputedStyle(document.documentElement).getPropertyValue('--wash').trim()
    if (!wash) return
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      if (meta.getAttribute('content') !== wash) meta.setAttribute('content', wash)
    }
  } catch {
    /* aperçu sans <head> : rien à faire */
  }
}

/**
 * Enregistre le service worker et propose les mises à jour sans jamais interrompre une saisie :
 * la nouvelle version attend (bandeau « Mettre à jour ») et la page ne se recharge que si
 * aucune saisie n'est en cours.
 */
async function registerServiceWorker() {
  if (state.env.isArtifact) return
  try {
    const sw = navigator.serviceWorker
    if (!sw) return
    const hadController = !!sw.controller
    const reg = await sw.register('./sw.js')
    state.swRegistration = reg
    const offer = (worker) => {
      if (!worker || !sw.controller) return // première installation : rien à proposer
      state.notices.update = worker
      renderNotices()
    }
    if (reg.waiting) offer(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') offer(worker)
      })
    })
    sw.addEventListener('controllerchange', () => {
      // Première prise de contrôle (clients.claim) : pas de rechargement.
      if (!hadController || state.swReloading) return
      state.notices.update = null
      if (guardActive() && !state.updateAccepted) {
        // Mise à jour activée depuis un autre onglet pendant une saisie : on attend.
        state.notices.reloadReady = true
        renderNotices()
        return
      }
      state.swReloading = true
      try { window.location.reload() } catch { /* aperçu */ }
    })
    reg.update().catch(() => {})
  } catch {
    /* l'app fonctionne sans service worker */
  }
}

function checkForUpdate() {
  try { state.swRegistration?.update().catch(() => {}) } catch { /* rien */ }
}

async function applyUpdate() {
  if (!(await confirmLeave())) return
  state.updateAccepted = true // l'utilisatrice a accepté de quitter sa saisie
  const worker = state.notices.update
  if (worker) {
    try { worker.postMessage({ type: 'SKIP_WAITING' }) } catch { /* rien */ }
  } else if (state.notices.reloadReady && !state.swReloading) {
    state.swReloading = true
    try { window.location.reload() } catch { /* aperçu */ }
  }
}

// ---------------------------------------------------------------------------
// Routeur

function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  const [first = '', second] = raw.split('/')
  let name
  let value
  try {
    name = decodeURIComponent(first)
    value = second === undefined ? undefined : decodeURIComponent(second)
  } catch {
    return { name: DEFAULT_ROUTE, params: {} }
  }
  if (!VIEWS[name]) return { name: DEFAULT_ROUTE, params: {} }
  const params = {}
  const spec = ROUTE_PARAM[name]
  if (spec && value !== undefined) {
    const parsed = spec.parse(value)
    if (parsed !== null) params[spec.key] = parsed
  }
  return { name, params }
}

function routeToHash(route) {
  const spec = ROUTE_PARAM[route.name]
  const value = spec ? route.params?.[spec.key] : undefined
  return `#${route.name}${value !== undefined && value !== null ? `/${encodeURIComponent(String(value))}` : ''}`
}

function readHash() {
  try {
    return window.location.hash
  } catch {
    return ''
  }
}

/** Reflète la route dans le hash ; replace = sans nouvelle entrée d'historique (démarrage, redirection). */
function writeHash(route, replace = false) {
  try {
    const target = routeToHash(route)
    if (window.location.hash === target) return
    if (replace) window.history.replaceState(null, '', target)
    else window.location.hash = target
  } catch {
    /* aperçu sandboxé : l'état reste en mémoire */
  }
}

function sameRoute(a, b) {
  return a.name === b.name && routeToHash(a) === routeToHash(b)
}

/** Redirige vers le premier lancement tant qu'il n'est pas terminé (hors démo). */
function guardRoute(route) {
  if (!state.isDemo && !state.data.profile.onboardingDone && !PRE_ONBOARDING_ROUTES.has(route.name)) {
    return { name: 'onboarding', params: {} }
  }
  return route
}

/** La vue en cours signale-t-elle une saisie non enregistrée ? (K7) Une garde qui plante compte comme oui. */
function guardActive() {
  if (typeof state.leaveGuard !== 'function') return false
  try {
    return !!state.leaveGuard()
  } catch {
    return true
  }
}

/**
 * Demande confirmation avant de quitter une saisie non enregistrée.
 * @returns {Promise<boolean>} true si on peut quitter
 */
async function confirmLeave() {
  if (!guardActive()) return true
  try {
    return await state.ui.confirm({
      title: 'Modifications non enregistrées',
      text: 'Si tu quittes ce jour maintenant, ce que tu viens de saisir sera perdu.',
      confirmLabel: 'Quitter sans enregistrer',
      cancelLabel: 'Rester',
      danger: true,
    })
  } catch {
    return false
  }
}

/** Entre sur une route : garde remise à null, compteur d'entrées incrémenté, hash, rendu. */
function enterRoute(route, { replace = false } = {}) {
  state.leaveGuard = null
  state.routeSeq += 1
  state.route = route
  state.notices.dayChange = null
  writeHash(route, replace)
  render({ routeChanged: true })
}

/**
 * Change de vue. Si la vue en cours a une saisie non enregistrée (K7), demande d'abord
 * confirmation, sauf avec { force: true }.
 * @param {string} name nom de route (contrat §6.1)
 * @param {object} [params]
 * @param {{force?: boolean, replace?: boolean}} [opts]
 * @returns {Promise<boolean>} true si la route a changé
 */
function navigate(name, params = {}, { force = false, replace = false } = {}) {
  const route = guardRoute({ name: VIEWS[name] ? name : DEFAULT_ROUTE, params: { ...params } })
  if (!force && guardActive()) {
    return confirmLeave().then((ok) => {
      if (ok) enterRoute(route, { replace })
      return ok
    })
  }
  enterRoute(route, { replace })
  return Promise.resolve(true)
}

async function onHashChange() {
  if (!state.data) return
  const parsed = parseHash(readHash())
  if (sameRoute(parsed, state.route)) return
  if (!(await confirmLeave())) {
    // Retour arrière ou lien refusé : on remet l'adresse de la vue en cours, sans re-rendre.
    writeHash(state.route, true)
    return
  }
  const route = guardRoute(parsed)
  if (sameRoute(route, state.route)) {
    writeHash(state.route, true)
    return
  }
  state.leaveGuard = null
  state.routeSeq += 1
  state.route = route
  state.notices.dayChange = null
  if (!sameRoute(parsed, route)) writeHash(route, true)
  render({ routeChanged: true })
}

function onBeforeUnload(event) {
  if (state.swReloading || !guardActive()) return
  event.preventDefault()
  event.returnValue = ''
}

// ---------------------------------------------------------------------------
// Analyse et alerte « un jour redevient fertile »

function runAnalysis() {
  state.now = computeNow()
  try {
    state.analysis = analyze(state.data, state.now)
    state.analysisError = null
  } catch (err) {
    state.analysis = null
    state.analysisError = err
    console.error('Lune : erreur du moteur', err)
    return
  }
  checkInfertileRegression()
}

/**
 * Jours affichés infertiles et jours qui ne le sont plus (alerte « un jour redevient fertile »).
 * Le même prédicat sert aux deux listes : un jour de bascule vu après 18 h (INFERTILE_POST)
 * puis revu le lendemain (FERTILE_JUSQU_A_18H, jour passé) reste compté comme affiché
 * infertile, sans fausse alerte ; une vraie remise en cause (FERTILE…) est toujours signalée.
 * @param {object} days Analysis.days
 * @param {string} today
 * @param {string[]} previous meta.infertileShown
 * @param {object} [dataDays] AppData.days (règles notées)
 * @returns {{current: string[], regressed: string[]}}
 */
export function computeInfertileRegression(days, today, previous, dataDays = {}) {
  const isInfertile = (iso) => INFERTILE_STATES.has(days[iso]?.state)
    || (days[iso]?.state === 'FERTILE_JUSQU_A_18H' && iso < today)
  const current = Object.keys(days).filter((iso) => iso <= today && isInfertile(iso)).sort()
  let regressed = (previous || []).filter((iso) => days[iso] && !isInfertile(iso))
  // Des règles notées sur un jour affiché infertile ouvrent un nouveau cycle (ou le garde-fou
  // « règles à confirmer ») : ces jours deviennent fertiles par construction, ce n'est pas une
  // remise en cause de la phase infertile passée. On n'alerte donc que pour les jours antérieurs.
  const newPeriod = regressed.find((iso) => PERIOD_BLEEDING.has(dataDays?.[iso]?.bleeding))
  if (newPeriod) regressed = regressed.filter((iso) => iso < newPeriod)
  return { current, regressed }
}

function checkInfertileRegression() {
  // Un autre onglet a écrit depuis : cette analyse est périmée, on n'écrit rien
  // (le prochain rendu recharge les données et refait le calcul).
  if (isStale()) return
  const previous = state.data.meta.infertileShown || []
  const { current, regressed } = computeInfertileRegression(state.analysis?.days || {}, state.now.today, previous, state.data.days)
  if (regressed.length) state.pendingRegression = regressed
  if (!sameList(previous, current)) {
    state.data.meta.infertileShown = current
    persist({ silentConflict: true })
  }
}

function showRegressionAlert(daysList) {
  const n = daysList.length
  const shown = daysList.slice(0, 5).map((iso) => fmtDate(iso, 'long'))
  const more = n > 5 ? ` et ${n - 5} autre${n - 5 > 1 ? 's' : ''}` : ''
  const subject = n > 1
    ? `Ces jours, affichés jusqu'ici comme infertiles, ne le sont plus : ${shown.join(', ')}${more}.`
    : `Ce jour, affiché jusqu'ici comme infertile, ne l'est plus : ${shown[0]}.`
  state.ui.confirm({
    title: n > 1 ? 'Des jours redeviennent fertiles' : 'Un jour redevient fertile',
    text: `${subject} Les règles ont été recalculées avec tes nouvelles données. Si tu as eu un rapport non protégé ${n > 1 ? 'ces jours-là' : 'ce jour-là'}, ouvre le parcours urgence.`,
    confirmLabel: 'Ouvrir le parcours urgence',
    cancelLabel: 'J\'ai compris',
  }).then((ok) => {
    if (ok) navigate('urgence')
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Persistance

/** Un autre onglet (ou « Tout effacer ») a-t-il écrit une révision plus récente ? */
function isStale() {
  if (state.isDemo || !state.data) return false
  const disk = peekRev()
  return disk !== null && disk > state.rev
}

/**
 * Recharge les données si elles ont changé ailleurs. Ne persiste rien.
 * @returns {boolean} true si les données ont été rechargées
 */
function resyncIfStale() {
  if (!isStale()) return false
  const fresh = loadData()
  // Seule la méta a changé (révision, jours affichés infertiles) : on garde le même objet,
  // pour que les vues qui suivent l'identité de ctx.data (brouillon Urgence) ne repartent pas de zéro.
  if (state.data && sameContent(state.data, fresh)) state.data.meta = fresh.meta
  else state.data = fresh
  state.rev = fresh.meta.rev
  return true
}

/**
 * Enregistre state.data.
 * @param {{silentConflict?: boolean}} [opts]
 * @returns {boolean|'conflict'} true si localStorage est écrit ; 'conflict' si un autre onglet a écrit entre-temps
 */
function persist({ silentConflict = false } = {}) {
  if (state.isDemo) return true
  const res = saveDataDetailed(state.data)
  if (res.conflict) {
    if (!silentConflict) state.ui?.toast('Tes données ont été modifiées dans une autre fenêtre. Vérifie puis enregistre à nouveau.')
    return 'conflict'
  }
  if (res.rev !== null) {
    state.rev = res.rev
    state.data.meta.rev = res.rev
  }
  const ok = res.ok
  if (!ok && !state.saveFailed) {
    state.saveFailed = true
    state.env.storageOk = false
    state.ui?.toast('Impossible d\'enregistrer sur cet appareil. Exporte une sauvegarde pour ne rien perdre.')
  } else if (ok && state.saveFailed) {
    state.saveFailed = false
    state.env.storageOk = true
  }
  return ok
}

/**
 * Écriture d'une action : recharge d'abord les données si un autre onglet a écrit, puis
 * réapplique seulement le changement de l'action (apply) sur ces données fraîches, puis enregistre.
 * @param {() => void} apply modifie state.data (peut le remplacer)
 * @returns {boolean|'conflict'}
 */
function commit(apply) {
  for (let attempt = 0; attempt < 2; attempt++) {
    resyncIfStale()
    apply()
    const res = persist({ silentConflict: attempt === 0 })
    if (res !== 'conflict') return res
  }
  return 'conflict'
}

function replaceData(next) {
  state.data = normalizeData(next, computeNow().today)
}

// ---------------------------------------------------------------------------
// Actions (contrat §6.1)

function startDemo({ fromArtifact = false } = {}) {
  const theme = state.data?.settings?.theme
  const demo = generateDemo(computeNow().today)
  if (theme) demo.settings.theme = theme
  state.isDemo = true
  state.demoFromArtifact = fromArtifact
  state.data = demo
}

function leaveDemo() {
  state.isDemo = false
  state.demoFromArtifact = false
  state.data = loadData()
  state.rev = state.data.meta.rev
}

const actions = {
  saveDay(iso, entry) {
    if (typeof iso !== 'string' || !isDayKey(iso, computeNow().today)) return null
    const clean = normalizeDay(entry)
    commit(() => {
      if (clean) state.data.days[iso] = clean
      else delete state.data.days[iso]
    })
    render()
    return clean
  },
  deleteDay(iso) {
    commit(() => { delete state.data.days[iso] })
    render()
  },
  updateProfile(patch) {
    const next = { ...(patch || {}) }
    if (isImplausibleRemovalDate(next.iudRemovalDate, computeNow().today)) {
      // Date aberrante (0026-10-05…) : refusée avec un avertissement, l'ancienne valeur est gardée.
      delete next.iudRemovalDate
      state.ui?.toast('La date du retrait semble invraisemblable : vérifie-la. L\'ancienne date est conservée.')
    }
    commit(() => replaceData({ ...state.data, profile: { ...state.data.profile, ...next } }))
    render()
  },
  updateRules(patch) {
    commit(() => replaceData({ ...state.data, rules: { ...state.data.rules, ...patch } }))
    render()
  },
  updateSettings(patch) {
    commit(() => replaceData({ ...state.data, settings: { ...state.data.settings, ...patch } }))
    render()
  },
  importData(appData) {
    if (state.isDemo) {
      state.isDemo = false
      state.demoFromArtifact = false
    }
    commit(() => replaceData(appData))
    navigate(state.data.profile.onboardingDone ? DEFAULT_ROUTE : 'onboarding', {}, { force: true })
  },
  /** @returns {Promise<boolean>} true si l'effacement est vérifié (K8) */
  async resetAll() {
    if (state.isDemo) {
      // En démo, on ne touche jamais aux vraies données.
      leaveDemo()
      state.ui.toast('Démo quittée. Tes données réelles n\'ont pas été modifiées.')
      navigate(state.data.profile.onboardingDone ? DEFAULT_ROUTE : 'onboarding', {}, { force: true })
      return true
    }
    const cleared = await clearAll()
    state.data = defaultData(computeNow().today)
    state.rev = peekRev() ?? 0
    state.saveFailed = false
    // On réécrit tout de suite des données vierges avec une révision plus haute que tout ce
    // qui pourrait rester (IndexedDB non supprimée, autre onglet) : elles gagnent au chargement.
    const res = saveDataDetailed(state.data)
    if (res.rev !== null) {
      state.rev = res.rev
      state.data.meta.rev = res.rev
    }
    const idb = await res.idb
    navigate('onboarding', {}, { force: true })
    const lsClean = res.ok || !storageAvailable()
    return lsClean && (cleared || idb === 'written')
  },
  loadDemo() {
    startDemo()
    navigate(DEFAULT_ROUTE, {}, { force: true })
  },
  exitDemo() {
    leaveDemo()
    navigate(state.data.profile.onboardingDone ? DEFAULT_ROUTE : 'onboarding', {}, { force: true })
  },
  markExported() {
    const today = computeNow().today
    commit(() => { state.data.settings.lastExportAt = today })
    render()
  },
  async requestPersistence() {
    const granted = await storeRequestPersistence()
    if (!state.isDemo) commit(() => { state.data.meta.persistGranted = granted })
    render()
    return granted
  },
}

function buildCtx() {
  return {
    data: state.data,
    analysis: state.analysis,
    now: state.now,
    route: { name: state.route.name, params: { ...state.route.params }, seq: state.routeSeq },
    navigate,
    setLeaveGuard(fn) {
      state.leaveGuard = typeof fn === 'function' ? fn : null
    },
    actions,
    ui: state.ui,
    env: { ...state.env, isDemo: state.isDemo },
  }
}

// ---------------------------------------------------------------------------
// Coque

function buildShell(host) {
  const header = h('header', { class: 'topbar' })
  const main = h('main', { class: 'main', id: 'main', tabIndex: -1 },
    h('p', { class: 'muted', role: 'status' }, 'Chargement…'))
  const tabbar = h('nav', { class: 'tabbar', ariaLabel: 'Navigation principale' })
  // Bandeaux de la coque (mise à jour, autre fenêtre, changement de jour) : mis à jour sans
  // re-rendre la vue, pour ne jamais effacer un formulaire en cours.
  const notices = h('div', { class: 'notices' })
  const root = h('div', { class: 'app' }, header, notices, main, tabbar)
  host.replaceChildren(root)
  state.shell = { root, header, notices, main, tabbar }
}

function noticesContent() {
  const out = []
  const n = state.notices
  if (n.dayChange) {
    const { today, shown } = n.dayChange
    const text = shown
      ? `On est maintenant le ${fmtDate(today, 'long')} : ce formulaire concerne le ${fmtDate(shown, 'long')}.`
      : `On est maintenant le ${fmtDate(today, 'long')} : vérifie les dates de ce formulaire.`
    out.push(banner('warn', 'calendar', text,
      state.route.name === 'noter'
        ? h('button', { type: 'button', class: 'btn btn--sm btn--primary', on: { click: () => navigate('noter', { date: computeNow().today }) } }, 'Passer à aujourd\'hui')
        : null))
  }
  if (n.external && !state.isDemo) {
    out.push(banner('warn', 'alert',
      'Données modifiées dans une autre fenêtre. Ce que tu enregistres ici s\'ajoutera à ces nouvelles données.'))
  }
  if (n.reloadReady) {
    out.push(banner('info', 'sparkle', 'Une nouvelle version de Lune est installée. Recharge quand tu auras enregistré.',
      h('button', { type: 'button', class: 'btn btn--sm btn--ghost', on: { click: () => applyUpdate() } }, 'Recharger')))
  } else if (n.update && !guardActive()) {
    out.push(banner('info', 'sparkle', 'Nouvelle version disponible.',
      h('button', { type: 'button', class: 'btn btn--sm btn--ghost', on: { click: () => applyUpdate() } }, 'Mettre à jour')))
  }
  return out
}

function renderNotices() {
  if (!state.shell?.notices) return
  try {
    state.shell.notices.replaceChildren(...noticesContent())
  } catch {
    /* bandeaux best effort */
  }
}

/** Lien interne : garde un vrai href (ouvrir dans un onglet, lecteurs d'écran) mais passe par le routeur. */
function routeLink(props, route, params, ...children) {
  return h('a', {
    ...props,
    attrs: { href: routeToHash({ name: route, params }), ...(props.attrs || {}) },
    on: { click: (e) => { e.preventDefault(); navigate(route, params) } },
  }, ...children)
}

function headerContent() {
  const onboarding = !state.isDemo && !state.data.profile.onboardingDone
  return [
    routeLink({ class: 'topbar__brand' }, DEFAULT_ROUTE, {},
      logoSvg({ size: 34 }),
      h('span', { class: 'topbar__title' }, 'Lune')),
    state.isDemo ? h('span', { class: 'badge badge--brand' }, 'Démo') : null,
    h('div', { class: 'topbar__actions' },
      routeLink({ class: 'topbar__urgence', ariaLabel: 'Urgence : préservatif rompu ou rapport à risque' }, 'urgence', {},
        icon('buoy', { size: 19 }), h('span', {}, 'Urgence')),
      onboarding ? null : routeLink({ class: 'iconbtn', ariaLabel: 'Réglages' }, 'reglages', {}, icon('gear', { size: 22 }))),
  ]
}

function banner(tone, iconName, text, button) {
  return h('div', { class: `banner banner--${tone}`, role: 'status' },
    icon(iconName, { size: 18 }),
    h('div', { class: 'banner__text' }, ...[].concat(text)),
    button || null)
}

function bannersContent() {
  const { data, isDemo, env, route } = state
  const out = []
  if (isDemo) {
    out.push(banner('demo', 'sparkle',
      [h('strong', {}, 'Démo'), ' — données fictives, rien n\'est enregistré.'],
      h('button', { type: 'button', class: 'btn btn--sm btn--primary', on: { click: () => actions.exitDemo() } },
        state.demoFromArtifact ? 'Commencer mon suivi' : 'Quitter la démo')))
  }
  if (!isDemo && env.isArtifact) {
    out.push(banner('warn', 'alert',
      'Aperçu en ligne : ce que tu notes ici peut être effacé sans prévenir. Pour ton vrai suivi, utilise l\'app installée sur ton téléphone.'))
  }
  if (!isDemo && !env.storageOk) {
    out.push(banner('warn', 'alert',
      'Le stockage de ce navigateur est indisponible : tes saisies risquent d\'être perdues à la fermeture. Évite la navigation privée et exporte régulièrement une sauvegarde.'))
  }
  const dayCount = Object.keys(data.days).length
  if (!isDemo && data.profile.onboardingDone && dayCount > 0 && route.name !== 'reglages') {
    const reference = data.settings.lastExportAt || data.createdAt
    if (dayNumber(state.now.today) - dayNumber(reference) > BACKUP_REMINDER_DAYS) {
      const text = data.settings.lastExportAt
        ? 'Ta dernière sauvegarde date de plus de 7 jours.'
        : 'Tu n\'as encore jamais exporté de sauvegarde.'
      out.push(banner('info', 'download', `${text} Tes données ne sont que sur cet appareil.`,
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost', on: { click: () => navigate('reglages') } }, 'Sauvegarder')))
    }
  }
  return out
}

function renderTabbar() {
  const hidden = state.route.name === 'onboarding'
  state.shell.tabbar.hidden = hidden
  if (hidden) {
    state.shell.tabbar.replaceChildren()
    return
  }
  const today = computeNow().today
  const tabs = TABS.map((tab) => {
    const active = state.route.name === tab.name
    return routeLink({
      class: cls('tabbar__item', tab.accent && 'tabbar__item--primary'),
      attrs: active ? { 'aria-current': 'page' } : {},
    }, tab.name, tab.name === 'noter' ? { date: today } : {},
    tab.accent ? h('span', { class: 'tabbar__plus' }, icon(tab.icon, { size: 28 })) : icon(tab.icon, { size: 24 }),
    h('span', { class: 'tabbar__label' }, tab.label))
  })
  state.shell.tabbar.replaceChildren(...tabs)
}

function technicalDetail(err) {
  return h('details', { class: 'app-error__detail' },
    h('summary', {}, 'Détail technique'),
    h('pre', { class: 'mono' }, String(err?.stack || err?.message || err)))
}

function analysisErrorCard() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJSON(state.data))
      state.ui.toast('Sauvegarde copiée. Colle-la dans une note ou un e-mail à toi-même.')
    } catch {
      state.ui.toast('La copie a échoué. Essaie depuis Réglages.')
    }
  }
  return h('section', { class: 'card stack app-error', role: 'alert' },
    h('h1', { class: 'section-title' }, 'Le calcul a rencontré une erreur'),
    h('p', {}, h('strong', {}, 'Par prudence, considère chaque jour comme fertile : protection nécessaire.')),
    h('p', { class: 'muted' }, 'Tes données sont intactes. Tu peux réessayer, corriger le dernier jour saisi, ou copier une sauvegarde pour la garder en lieu sûr.'),
    technicalDetail(state.analysisError),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn--primary btn--sm', on: { click: () => render() } }, 'Réessayer'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: copy } }, 'Copier ma sauvegarde'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: () => navigate('noter', { date: state.now.today }) } }, 'Noter un jour')))
}

function viewErrorCard(err) {
  return h('section', { class: 'card stack app-error', role: 'alert' },
    h('h1', { class: 'section-title' }, 'Cette page n\'a pas pu s\'afficher'),
    h('p', { class: 'muted' }, 'Tes données ne sont pas touchées. En cas de doute, considère le jour comme fertile.'),
    technicalDetail(err),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn btn--primary btn--sm', on: { click: () => navigate(DEFAULT_ROUTE) } }, 'Revenir à Aujourd\'hui')))
}

function renderMain() {
  const name = state.route.name
  const viewRoot = h('section', { class: `view view--${name}` })
  const children = bannersContent()
  if (state.analysisError) children.push(analysisErrorCard())
  const canRender = !state.analysisError || !DECISION_ROUTES.has(name)
  if (canRender) children.push(viewRoot)
  state.shell.main.replaceChildren(...children)
  if (!canRender) return
  try {
    const cleanup = VIEWS[name].render(viewRoot, buildCtx())
    state.cleanup = typeof cleanup === 'function' ? cleanup : null
  } catch (err) {
    console.error(`Lune : erreur dans la vue ${name}`, err)
    viewRoot.replaceChildren(viewErrorCard(err))
  }
}

/**
 * Ré-analyse puis reconstruit la coque et la vue courante.
 * @param {{routeChanged?: boolean}} [opts]
 */
function render(opts = {}) {
  if (!state.data || !state.shell) return
  if (state.rendering) {
    // Navigation déclenchée pendant le rendu d'une vue : on la rejoue juste après.
    state.renderQueued = { routeChanged: !!(state.renderQueued?.routeChanged || opts.routeChanged) }
    return
  }
  state.rendering = true
  try {
    // Données écrites par un autre onglet depuis le dernier rendu : on part de la version à jour.
    if (resyncIfStale()) {
      state.notices.external = false
      const guarded = guardRoute(state.route)
      if (!sameRoute(guarded, state.route)) {
        state.route = guarded
        state.leaveGuard = null
        state.routeSeq += 1
        writeHash(guarded, true)
      }
    }
    // La vue est reconstruite à partir des données à jour : le bandeau « autre fenêtre » n'a plus lieu d'être.
    state.notices.external = false
    if (state.cleanup) {
      try { state.cleanup() } catch { /* nettoyage best effort */ }
      state.cleanup = null
    }
    runAnalysis()
    state.lastSlot = slotOf(state.now)
    state.lastToday = state.now.today
    if (state.notices.dayChange && state.notices.dayChange.today !== state.now.today) state.notices.dayChange = null
    applyTheme()
    applyPhase()
    state.shell.header.replaceChildren(...headerContent().filter(Boolean))
    renderMain()
    renderTabbar()
    renderNotices()
    try { document.title = `${ROUTE_LABELS[state.route.name]} · Lune` } catch { /* titre figé (aperçu) */ }
    if (opts.routeChanged) {
      try { window.scrollTo(0, 0) } catch { /* rien */ }
      state.shell.main.focus({ preventScroll: true })
    }
  } finally {
    state.rendering = false
  }
  if (state.renderQueued) {
    const queued = state.renderQueued
    state.renderQueued = null
    render(queued)
    return
  }
  if (state.pendingRegression) {
    const list = state.pendingRegression
    state.pendingRegression = null
    setTimeout(() => showRegressionAlert(list), 0)
  }
}

// ---------------------------------------------------------------------------
// Rafraîchissements : minuit, autour de 18:00, retour au premier plan

function msUntilNextBoundary() {
  const d = new Date()
  const evening = new Date(d)
  evening.setHours(18, 0, 0, 0)
  const midnight = new Date(d)
  midnight.setHours(24, 0, 0, 0)
  return (d < evening ? evening : midnight) - d
}

function msSinceEvening() {
  const d = new Date()
  const evening = new Date(d)
  evening.setHours(18, 0, 0, 0)
  return d - evening
}

function scheduleTick() {
  clearTimeout(state.timer)
  const until = msUntilNextBoundary()
  const since = msSinceEvening()
  const nearEvening = since >= 0 && since < 5 * 60000
  let delay
  if (until <= 10 * 60000 || nearEvening) delay = Math.min(60000, until + 1000)
  else delay = Math.min(until - 10 * 60000, 30 * 60000)
  state.timer = setTimeout(tick, Math.max(1000, delay))
}

function refreshIfSlotChanged() {
  if (INPUT_ROUTES.has(state.route.name)) return // l'heure est recalculée au prochain rendu
  if (slotOf(computeNow()) !== state.lastSlot) render()
}

/** Comparaison des données hors révision (pour ne pas signaler un changement sans contenu). */
function sameContent(a, b) {
  try {
    // meta (révision, jours déjà affichés infertiles) n'est pas une donnée saisie.
    const strip = (d) => JSON.stringify({ ...d, meta: null })
    return strip(a) === strip(b)
  } catch {
    return false
  }
}

/**
 * Se resynchronise avec ce que d'autres onglets ont écrit. Sur une route de saisie, la vue
 * n'est pas re-rendue (le formulaire est gardé) : un bandeau prévient, et l'enregistrement
 * repart des données à jour (commit). Ailleurs, la vue est re-rendue.
 * @returns {boolean} true si les données ont changé
 */
function syncFromStorage() {
  if (state.isDemo || !state.data || !isStale()) return false
  const before = state.data
  resyncIfStale()
  if (sameContent(before, state.data)) return false
  const guarded = guardRoute(state.route)
  if (!sameRoute(guarded, state.route)) {
    // Données effacées ailleurs : retour au premier lancement, sans rien réécrire.
    navigate(guarded.name, guarded.params, { force: true, replace: true })
    return true
  }
  if (INPUT_ROUTES.has(state.route.name)) {
    state.notices.external = true
    renderNotices()
  } else {
    render()
  }
  return true
}

function onStorage(event) {
  const key = event?.key
  if (key !== null && key !== undefined && key !== LS_DATA_KEY && key !== LS_RESET_KEY) return
  syncFromStorage()
}

/**
 * Que faire quand la date a changé depuis le dernier rendu d'une route de saisie ?
 * @param {{routeName: string, paramDate?: string|null, lastToday: string|null, today: string, dirty: boolean}} p
 * @returns {'none'|'navigate'|'banner'|'rerender'}
 *   navigate : rouvrir Noter sur le nouvel aujourd'hui ; banner : saisie en cours, on prévient ;
 *   rerender : re-rendre la même vue (autre date passée affichée, ou premier lancement)
 */
export function dayChangeDecision({ routeName, paramDate = null, lastToday, today, dirty }) {
  if (!INPUT_ROUTES.has(routeName) || !lastToday || today === lastToday) return 'none'
  if (dirty) return 'banner'
  if (routeName === 'noter') {
    const shown = paramDate || lastToday
    return shown === lastToday ? 'navigate' : 'rerender'
  }
  return 'rerender'
}

function checkDayChange() {
  if (!state.data || !state.lastToday) return
  const { today } = computeNow()
  const params = state.route.params || {}
  const decision = dayChangeDecision({
    routeName: state.route.name,
    paramDate: params.date || null,
    lastToday: state.lastToday,
    today,
    dirty: guardActive(),
  })
  if (decision === 'navigate') {
    navigate('noter', { date: today }, { force: true, replace: true })
  } else if (decision === 'rerender') {
    render()
  } else if (decision === 'banner') {
    const shown = state.route.name === 'noter' ? (params.date || state.lastToday) : null
    if (state.notices.dayChange?.today !== today) {
      state.notices.dayChange = { today, shown }
      renderNotices()
    }
  }
}

function tick() {
  syncFromStorage()
  checkDayChange()
  refreshIfSlotChanged()
  renderNotices()
  scheduleTick()
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  const synced = syncFromStorage()
  checkDayChange()
  if (!synced && !INPUT_ROUTES.has(state.route.name)) render()
  checkForUpdate()
  scheduleTick()
}

// ---------------------------------------------------------------------------
// Démarrage

function fatalError(host, err) {
  console.error('Lune : échec du démarrage', err)
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.padding = '16px'
  const title = document.createElement('h1')
  title.textContent = 'Lune n\'a pas pu démarrer'
  const text = document.createElement('p')
  text.textContent = 'Recharge la page. En attendant, considère chaque jour comme fertile : protection nécessaire.'
  const pre = document.createElement('pre')
  pre.textContent = String(err?.stack || err)
  box.append(title, text, pre)
  host.replaceChildren(box)
  markReady()
}

/** Signale au script de secours d'index.html que l'app a démarré (ou affiché sa propre erreur). */
function markReady() {
  try { document.documentElement.dataset.ready = '1' } catch { /* rien */ }
}

/**
 * Démarre l'application dans #app. Appelée automatiquement dans le navigateur.
 * @returns {Promise<void>}
 */
export async function start() {
  const host = document.getElementById('app') || document.body
  try {
    state.env = detectEnv()
    state.ui = createUI(host)
    buildShell(host)

    let loaded
    try {
      loaded = await loadDataAsync()
    } catch {
      loaded = { data: defaultData(computeNow().today), source: 'memoire' }
    }
    state.data = loaded.data
    state.rev = Number.isInteger(loaded.data?.meta?.rev) ? loaded.data.meta.rev : 0
    if (loaded.source === 'memoire' || loaded.lsFailed) state.env.storageOk = false

    if (state.env.isArtifact && !state.data.profile.onboardingDone) startDemo({ fromArtifact: true })

    state.route = guardRoute(parseHash(readHash()))
    writeHash(state.route, true)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    try {
      // Thème automatique : la barre du navigateur suit le passage clair / sombre du système.
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor)
    } catch { /* navigateur ancien */ }
    registerServiceWorker()
    render()
    scheduleTick()
    markReady()
    if (loaded.warning === 'restored') {
      state.ui.toast('Une sauvegarde a été restaurée : vérifie tes dernières saisies.')
    }
  } catch (err) {
    fatalError(host, err)
  }
}

// Accès internes pour les tests sous Node (aucun effet dans le navigateur).
export const __test = {
  state, navigate, onHashChange, enterRoute, confirmLeave, guardActive, buildCtx, actions,
  runAnalysis, checkInfertileRegression, resyncIfStale, syncFromStorage, onStorage, checkDayChange,
  tick, commit, persist, routeToHash,
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') start()
