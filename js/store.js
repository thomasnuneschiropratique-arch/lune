// Persistance locale de Lune : localStorage (source principale), miroir IndexedDB,
// copie de secours quotidienne, repli mémoire. Schéma, migrations, import / export.
// Aucun accès au navigateur au chargement du module : tout passe par des fonctions.

export const SCHEMA = 1
const LS_KEY = 'lune:data:v1'
const LS_BACKUP_KEY = 'lune:backup:v1'
const LS_CORRUPT_KEY = 'lune:corrupt:v1'
// Marqueur écrit par clearAll : { at, rev }. Un onglet dont la révision de base est
// antérieure à rev ne peut plus écrire (il doit d'abord recharger).
const LS_RESET_KEY = 'lune:reset:v1'
const IDB_NAME = 'lune'
const IDB_STORE = 'kv'
const IDB_KEY = 'data'
const IDB_TIMEOUT_MS = 2000

const TEMP_MIN = 3400
const TEMP_MAX = 4200
const NOTES_MAX = 2000
// Bornes des clés de jours : rien avant 2000, rien au-delà d'un an après aujourd'hui.
const DAY_KEY_MIN = '2000-01-01'
const DAY_KEY_MAX_AHEAD = 366
const SHORT_TEXT_MAX = 500

// ---------------------------------------------------------------------------
// Énumérations (contrat §3)

const ENUMS = {
  bleeding: ['spotting', 'leger', 'moyen', 'abondant', 'post_retrait'],
  tempRoute: ['buccale', 'vaginale', 'rectale'],
  tempDisturbances: ['maladie', 'alcool', 'nuit_courte', 'heure_inhabituelle', 'voyage', 'stress', 'medicament', 'autre'],
  mucusSensation: ['sec', 'rien', 'humide', 'mouille'],
  mucusAspect: ['rien', 'epaisse', 'filante'],
  cervixOpening: ['ferme', 'mi_ouvert', 'ouvert'],
  cervixFirmness: ['dur', 'mou'],
  cervixPosition: ['bas', 'moyen', 'haut'],
  lh: ['negatif', 'positif'],
  pregnancyTest: ['negatif', 'positif'],
  sex: ['protege', 'non_protege', 'incident'],
  emergencyContraception: ['levonorgestrel', 'ulipristal', 'diu_cuivre'],
  events: ['maladie', 'voyage', 'stress_majeur', 'nouveau_medicament', 'fausse_couche'],
  iudType: ['cuivre', 'hormonal', 'inconnu'],
  rnpBeforeRemoval: ['oui', 'non', 'ne_sait_pas'],
  secondarySign: ['glaire', 'col'],
  learningMode: ['auto', 'off'],
  theme: ['auto', 'clair', 'sombre'],
}

const PERIOD_BLEEDING = ['leger', 'moyen', 'abondant']

// ---------------------------------------------------------------------------
// Petits validateurs

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const TAG_RE = /^[a-z0-9_]{1,40}$/

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isISODate(v) {
  if (typeof v !== 'string') return false
  const m = ISO_RE.exec(v)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date(0)
  t.setUTCFullYear(y, mo - 1, d) // setUTCFullYear : pas de décalage 19xx pour les années < 100
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

function isTime(v) {
  return typeof v === 'string' && TIME_RE.test(v)
}

function enumOr(value, list, fallback = null) {
  return list.includes(value) ? value : fallback
}

function isoOrNull(v) {
  return isISODate(v) ? v : null
}

function timeOrNull(v) {
  return isTime(v) ? v : null
}

/** Tableau d'énumération dédupliqué, dans l'ordre de la liste de référence. */
function enumArray(v, list) {
  if (!Array.isArray(v)) return []
  const set = new Set(v)
  return list.filter((x) => set.has(x))
}

/** Tableau d'identifiants libres (symptômes, humeurs) dédupliqué, ordre de saisie. */
function tagArray(v) {
  if (!Array.isArray(v)) return []
  const out = []
  for (const x of v) {
    if (typeof x === 'string' && TAG_RE.test(x) && !out.includes(x)) out.push(x)
    if (out.length >= 40) break
  }
  return out
}

/** Texte nettoyé (caractères de contrôle retirés, espaces de bord), tronqué à max caractères. */
function cleanText(v, max) {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (s.length > max) s = Array.from(s).slice(0, max).join('').trim()
  return s
}

function localTodayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

/**
 * Clé de jour plausible : date ISO valide, à partir du 2000-01-01 et au plus 366 jours
 * après aujourd'hui. Les clés aberrantes (0100-01-01…) sont écartées à l'import et refusées à la saisie.
 * @param {string} iso
 * @param {string} [todayISO] aujourd'hui (date locale par défaut)
 * @returns {boolean}
 */
export function isDayKey(iso, todayISO) {
  if (!isISODate(iso) || iso < DAY_KEY_MIN) return false
  const today = isISODate(todayISO) ? todayISO : localTodayISO()
  return iso <= addDaysISO(today, DAY_KEY_MAX_AHEAD)
}

/** Date de retrait invraisemblable : avant 2000, ou plus d'un an dans le futur. */
export function isImplausibleRemovalDate(iso, todayISO) {
  return isISODate(iso) && !isDayKey(iso, todayISO)
}

// ---------------------------------------------------------------------------
// Données par défaut et normalisation

/**
 * AppData vierge.
 * @param {string} [todayISO] date locale 'YYYY-MM-DD' (par défaut : aujourd'hui)
 * @returns {object} AppData
 */
export function defaultData(todayISO) {
  return {
    schema: SCHEMA,
    createdAt: isISODate(todayISO) ? todayISO : localTodayISO(),
    profile: {
      iudType: null,
      iudModel: null,
      iudRemovalDate: null,
      iudRemovalTime: null,
      rnpBeforeRemoval: null,
      rnpBeforeRemovalDate: null,
      birthYear: null,
      tempRoute: 'buccale',
      secondarySign: 'glaire',
      usualWakeTime: null,
      onboardingDone: false,
      disclaimerAcceptedAt: null,
    },
    rules: {
      learningMode: 'auto',
      strictFSRH: false,
      preOvulatoryRule: false,
      postHormonalCopper: false,
    },
    days: {},
    settings: {
      theme: 'auto',
      showSexLog: true,
      lastExportAt: null,
      reminderTime: null,
    },
    meta: {
      infertileShown: [],
      persistGranted: null,
      rev: 0,
    },
  }
}

/**
 * Convertit une saisie de température en centièmes entiers.
 * Accepte « 36,47 », « 36.5 » (1 ou 2 décimales, virgule ou point), plage 34,00–42,00.
 * @param {string|number} str
 * @returns {number|null} centièmes (ex. 3647) ou null si invalide
 */
export function parseTemp(str) {
  if (typeof str === 'number') {
    if (!Number.isFinite(str)) return null
    str = String(str)
  }
  if (typeof str !== 'string') return null
  const m = /^(\d{2})[.,](\d{1,2})$/.exec(str.trim())
  if (!m) return null
  const c = Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'))
  return c >= TEMP_MIN && c <= TEMP_MAX ? c : null
}

function normalizeTempValue(v) {
  if (Number.isInteger(v)) return v >= TEMP_MIN && v <= TEMP_MAX ? v : null
  return parseTemp(v)
}

/**
 * Nettoie et valide un DayEntry : types, énumérations, plages, cohérence entre champs.
 * Les champs inconnus, invalides ou vides sont supprimés.
 * @param {object} entry
 * @returns {object|null} entrée normalisée, ou null si plus rien n'est renseigné
 */
export function normalizeDay(entry) {
  if (!isPlainObject(entry)) return null
  const e = entry
  const out = {}

  const bleeding = enumOr(e.bleeding, ENUMS.bleeding)
  if (bleeding) out.bleeding = bleeding
  if (e.cycleStart === true && PERIOD_BLEEDING.includes(bleeding)) out.cycleStart = true

  const temp = normalizeTempValue(e.temp)
  if (temp !== null) {
    out.temp = temp
    const tempTime = timeOrNull(e.tempTime)
    if (tempTime) out.tempTime = tempTime
    const tempRoute = enumOr(e.tempRoute, ENUMS.tempRoute)
    if (tempRoute) out.tempRoute = tempRoute
    // Changement de thermomètre (K6) : n'a de sens qu'avec une valeur.
    if (e.thermometerChanged === true) out.thermometerChanged = true
  }
  const disturbances = enumArray(e.tempDisturbances, ENUMS.tempDisturbances)
  if (disturbances.length) out.tempDisturbances = disturbances
  const disturbanceNote = cleanText(e.tempDisturbanceNote, SHORT_TEXT_MAX)
  if (disturbanceNote) out.tempDisturbanceNote = disturbanceNote
  if (e.tempExcluded === true && disturbances.length) out.tempExcluded = true

  for (const key of ['mucusSensation', 'mucusAspect', 'cervixOpening', 'cervixFirmness', 'cervixPosition', 'lh', 'pregnancyTest']) {
    const v = enumOr(e[key], ENUMS[key])
    if (v) out[key] = v
  }
  if (e.mucusDoubtful === true) out.mucusDoubtful = true

  const sex = enumOr(e.sex, ENUMS.sex)
  if (sex) {
    out.sex = sex
    const sexTime = timeOrNull(e.sexTime)
    if (sexTime) out.sexTime = sexTime
  }
  const ec = enumOr(e.emergencyContraception, ENUMS.emergencyContraception)
  if (ec) {
    out.emergencyContraception = ec
    const ecTime = timeOrNull(e.emergencyContraceptionTime)
    if (ecTime) out.emergencyContraceptionTime = ecTime
  }
  if (e.cycleUnevaluable === true) out.cycleUnevaluable = true

  const events = enumArray(e.events, ENUMS.events)
  if (events.length) out.events = events

  const pain = typeof e.pain === 'string' && e.pain.trim() !== '' ? Number(e.pain) : e.pain
  if (Number.isInteger(pain) && pain >= 0 && pain <= 10) out.pain = pain

  const symptoms = tagArray(e.symptoms)
  if (symptoms.length) out.symptoms = symptoms
  const moods = tagArray(e.moods)
  if (moods.length) out.moods = moods

  const notes = cleanText(e.notes, NOTES_MAX)
  if (notes) out.notes = notes

  return Object.keys(out).length ? out : null
}

function normalizeProfile(p, base) {
  const src = isPlainObject(p) ? p : {}
  const out = { ...base }
  out.iudType = enumOr(src.iudType, ENUMS.iudType)
  const model = cleanText(src.iudModel, 60)
  out.iudModel = model || null
  // Une date aberrante (0026-10-05…) n'est jamais remise à null en silence : le moteur
  // ne doit pas perdre R. Elle est gardée telle quelle et signalée (profileWarnings).
  out.iudRemovalDate = isoOrNull(src.iudRemovalDate)
  out.iudRemovalTime = timeOrNull(src.iudRemovalTime)
  out.rnpBeforeRemoval = enumOr(src.rnpBeforeRemoval, ENUMS.rnpBeforeRemoval)
  out.rnpBeforeRemovalDate = out.rnpBeforeRemoval === 'oui' ? isoOrNull(src.rnpBeforeRemovalDate) : null
  out.birthYear = Number.isInteger(src.birthYear) && src.birthYear >= 1900 && src.birthYear <= 2100 ? src.birthYear : null
  out.tempRoute = enumOr(src.tempRoute, ENUMS.tempRoute, base.tempRoute)
  out.secondarySign = enumOr(src.secondarySign, ENUMS.secondarySign, base.secondarySign)
  out.usualWakeTime = timeOrNull(src.usualWakeTime)
  out.onboardingDone = src.onboardingDone === true
  out.disclaimerAcceptedAt = isoOrNull(src.disclaimerAcceptedAt)
  return out
}

function normalizeRules(r, base) {
  const src = isPlainObject(r) ? r : {}
  return {
    learningMode: enumOr(src.learningMode, ENUMS.learningMode, base.learningMode),
    strictFSRH: src.strictFSRH === true,
    preOvulatoryRule: src.preOvulatoryRule === true,
    postHormonalCopper: src.postHormonalCopper === true,
  }
}

function normalizeSettings(s, base) {
  const src = isPlainObject(s) ? s : {}
  return {
    theme: enumOr(src.theme, ENUMS.theme, base.theme),
    showSexLog: typeof src.showSexLog === 'boolean' ? src.showSexLog : base.showSexLog,
    lastExportAt: isoOrNull(src.lastExportAt),
    reminderTime: timeOrNull(src.reminderTime),
  }
}

function revOf(obj) {
  const r = obj?.meta?.rev
  return Number.isInteger(r) && r >= 0 ? r : 0
}

function normalizeMeta(m, today) {
  const src = isPlainObject(m) ? m : {}
  const shown = Array.isArray(src.infertileShown)
    ? [...new Set(src.infertileShown.filter((iso) => isDayKey(iso, today)))].sort()
    : []
  return {
    infertileShown: shown,
    persistGranted: typeof src.persistGranted === 'boolean' ? src.persistGranted : null,
    rev: revOf({ meta: src }),
  }
}

// Migrations : MIGRATIONS[n] transforme des données au schéma n en schéma n + 1.
const MIGRATIONS = [
  // 0 → 1 : données sans numéro de schéma (aucune version publiée avant le schéma 1).
  (d) => ({ ...d, schema: 1 }),
]

function schemaOf(raw) {
  return Number.isInteger(raw?.schema) && raw.schema >= 0 ? raw.schema : 0
}

function migrate(raw) {
  let d = raw
  for (let s = schemaOf(raw); s < SCHEMA; s++) d = MIGRATIONS[s](d)
  return d
}

/**
 * Migre puis normalise un AppData complet (profil, règles, jours, réglages, méta).
 * Ne jette jamais : toute valeur invalide est remplacée par sa valeur par défaut.
 * @param {object} raw
 * @param {string} [todayISO]
 * @returns {object} AppData
 */
export function normalizeData(raw, todayISO) {
  const src = migrate(isPlainObject(raw) ? raw : {})
  const today = isISODate(todayISO) ? todayISO : localTodayISO()
  const base = defaultData(today)
  const profile = normalizeProfile(src.profile, base.profile)
  const days = {}
  if (isPlainObject(src.days)) {
    for (const iso of Object.keys(src.days).filter((k) => isDayKey(k, today)).sort()) {
      const day = normalizeDay(src.days[iso])
      if (!day) continue
      // Voie figée (EC-10) : une mesure sans voie garde la voie du profil au moment où elle
      // est enregistrée ou importée, au lieu de suivre plus tard un changement de voie.
      if (Number.isInteger(day.temp) && !day.tempRoute) day.tempRoute = profile.tempRoute
      days[iso] = day
    }
  }
  return {
    schema: SCHEMA,
    createdAt: isoOrNull(src.createdAt) || base.createdAt,
    profile,
    rules: normalizeRules(src.rules, base.rules),
    days,
    settings: normalizeSettings(src.settings, base.settings),
    meta: normalizeMeta(src.meta, today),
  }
}

// ---------------------------------------------------------------------------
// localStorage

let memoryData = null // repli mémoire : dernière version enregistrée dans cette session
// Révision des données que cette instance détient (chargées ou enregistrées). Sert de base
// à l'écriture optimiste : on refuse d'écrire par-dessus une révision plus récente.
let lastRev = 0

function ls() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

/**
 * Indique si localStorage est utilisable (écriture et suppression testées).
 * @returns {boolean}
 */
export function storageAvailable() {
  try {
    const s = ls()
    if (!s) return false
    const k = 'lune:test'
    s.setItem(k, k)
    s.removeItem(k)
    return true
  } catch {
    return false
  }
}

function lsGet(key) {
  try {
    const s = ls()
    return s ? s.getItem(key) : null
  } catch {
    return null
  }
}

function lsSet(key, value) {
  try {
    const s = ls()
    if (!s) return false
    s.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function lsRemove(key) {
  try {
    ls()?.removeItem(key)
  } catch {
    /* rien à faire */
  }
}

function parseStored(text) {
  try {
    const obj = JSON.parse(text)
    return isPlainObject(obj) ? obj : null
  } catch {
    return null
  }
}

function readBackup() {
  const raw = lsGet(LS_BACKUP_KEY)
  const obj = raw ? parseStored(raw) : null
  return obj && isPlainObject(obj.data) ? obj.data : null
}

function readResetRev() {
  const marker = parseStored(lsGet(LS_RESET_KEY) || '')
  return marker && Number.isInteger(marker.rev) && marker.rev >= 0 ? marker.rev : 0
}

/**
 * Lit la copie principale de localStorage.
 * @returns {{obj: object|null, corrupt: boolean}} corrupt = copie présente mais illisible
 */
function readLocalDetailed() {
  const raw = lsGet(LS_KEY)
  if (raw === null) return { obj: null, corrupt: false }
  const obj = parseStored(raw)
  if (obj) return { obj, corrupt: false }
  // Donnée illisible : on la met de côté pour ne pas la perdre.
  if (lsGet(LS_CORRUPT_KEY) === null) lsSet(LS_CORRUPT_KEY, raw)
  return { obj: null, corrupt: true }
}

/**
 * Révision actuellement sur disque (localStorage) : la plus grande entre celle du document
 * et celle du marqueur d'effacement. Lecture synchrone, sans effet de bord.
 * @returns {number|null} null si localStorage est indisponible
 */
export function peekRev() {
  let raw
  try {
    const s = ls()
    if (!s) return null
    raw = s.getItem(LS_KEY)
  } catch {
    return null
  }
  const doc = raw === null ? null : parseStored(raw)
  return Math.max(doc ? revOf(doc) : 0, readResetRev())
}

/** Fixe la révision de base de cette instance après un chargement. */
function adoptRev(data, docRev) {
  const rev = Math.max(docRev, readResetRev())
  data.meta.rev = rev
  lastRev = rev
  return data
}

/**
 * Chargement synchrone depuis localStorage (normalisé, migré). Ne jette jamais.
 * Sert aussi à se resynchroniser quand un autre onglet a écrit (voir peekRev).
 * @returns {object} AppData (défaut si rien n'est enregistré ; meta.rev = révision lue)
 */
export function loadData() {
  try {
    const { obj, corrupt } = readLocalDetailed()
    const raw = obj || (corrupt ? readBackup() : null)
    if (raw) return adoptRev(normalizeData(raw), revOf(raw))
    // Le repli mémoire ne sert que sans localStorage : si localStorage marche et ne contient
    // rien, les données ont été effacées (ici ou dans un autre onglet) et ne doivent pas revenir.
    if (memoryData && !storageAvailable()) return clone(memoryData)
  } catch {
    /* repli sur les données par défaut */
  }
  return adoptRev(defaultData(), 0)
}

// ---------------------------------------------------------------------------
// IndexedDB (miroir asynchrone, ouvert à la demande)

let idbPromise = null

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('IndexedDB : délai dépassé')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

function idbFactory() {
  try {
    return globalThis.indexedDB || null
  } catch {
    return null
  }
}

function openIDB() {
  if (idbPromise) return idbPromise
  const p = withTimeout(new Promise((resolve, reject) => {
    const idb = idbFactory()
    if (!idb) throw new Error('IndexedDB indisponible')
    const req = idb.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => {
      const db = req.result
      // Un autre onglet veut supprimer la base (« Tout effacer ») : on la libère.
      db.onversionchange = () => {
        try { db.close() } catch { /* déjà fermée */ }
        if (idbPromise === p) idbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloquée'))
  }), IDB_TIMEOUT_MS)
  idbPromise = p
  p.catch(() => { if (idbPromise === p) idbPromise = null })
  return p
}

/** Transaction sur le magasin : fn(store, setResult) ; résout avec le résultat à la fin. */
async function idbTx(mode, fn) {
  const db = await openIDB()
  return withTimeout(new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode)
    let result
    fn(tx.objectStore(IDB_STORE), (v) => { result = v })
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error('IndexedDB : erreur'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB : transaction annulée'))
  }), IDB_TIMEOUT_MS)
}

function idbGetStrict() {
  return idbTx('readonly', (store, set) => {
    const req = store.get(IDB_KEY)
    req.onsuccess = () => set(req.result)
  })
}

async function idbGet() {
  try {
    return await idbGetStrict()
  } catch {
    return undefined
  }
}

function parseIdbValue(v) {
  if (typeof v === 'string') return parseStored(v)
  return isPlainObject(v) ? v : null
}

/**
 * Écrit le document dans IndexedDB, sauf si IndexedDB contient déjà une révision égale ou plus haute.
 * @returns {Promise<'written'|'skipped'|'failed'>}
 */
async function idbPutIfNewer(text, rev) {
  try {
    return await idbTx('readwrite', (store, set) => {
      const req = store.get(IDB_KEY)
      req.onsuccess = () => {
        const current = parseIdbValue(req.result)
        if (current && revOf(current) >= rev) {
          set('skipped')
          return
        }
        store.put(text, IDB_KEY)
        set('written')
      }
    })
  } catch {
    return 'failed'
  }
}

/**
 * Chargement complet : lit localStorage ET IndexedDB, garde la révision la plus haute
 * (l'ancien format compte comme révision 0) et répare la copie la moins à jour.
 * Une copie IndexedDB antérieure au dernier « Tout effacer » est ignorée.
 * @returns {Promise<{data: object, source: 'localStorage'|'indexedDB'|'defaut'|'memoire',
 *   lsFailed?: boolean, warning?: 'restored'}>}
 *   lsFailed : les données viennent d'IndexedDB mais localStorage n'a pas pu être réécrit ;
 *   warning 'restored' : la copie principale était illisible, une sauvegarde a été restaurée.
 */
export async function loadDataAsync() {
  const lsOk = storageAvailable()
  let local = { obj: null, corrupt: false }
  try {
    local = readLocalDetailed()
  } catch {
    /* on tente IndexedDB */
  }
  const stored = await Promise.race([
    idbGet(),
    new Promise((resolve) => setTimeout(() => resolve(undefined), IDB_TIMEOUT_MS)),
  ])
  const resetRev = readResetRev()
  let idbObj = parseIdbValue(stored)
  if (idbObj && resetRev > 0 && revOf(idbObj) < resetRev) idbObj = null // antérieure à un effacement

  let chosen = null
  let source = null
  let warning = null
  if (local.obj && !(idbObj && revOf(idbObj) > revOf(local.obj))) {
    chosen = local.obj
    source = 'localStorage'
  } else if (idbObj) {
    chosen = idbObj
    source = 'indexedDB'
    if (local.corrupt) warning = 'restored'
  } else if (local.corrupt) {
    const backup = readBackup()
    if (backup) {
      chosen = backup
      source = 'localStorage'
      warning = 'restored'
    }
  }

  if (chosen) {
    let data
    try {
      data = adoptRev(normalizeData(chosen), revOf(chosen))
    } catch {
      data = adoptRev(defaultData(), 0)
    }
    const text = JSON.stringify(data)
    let lsFailed = false
    if (lsOk && (source === 'indexedDB' || local.corrupt)) {
      // localStorage était vide, en retard ou illisible : on le répare.
      lsFailed = !lsSet(LS_KEY, text)
      if (lsFailed && lsGet(LS_BACKUP_KEY) !== null) {
        lsRemove(LS_BACKUP_KEY)
        lsFailed = !lsSet(LS_KEY, text)
      }
    }
    memoryData = clone(data)
    if (!idbObj || revOf(idbObj) < data.meta.rev) idbPutIfNewer(text, data.meta.rev)
    const out = { data, source }
    if (lsFailed) out.lsFailed = true
    if (warning) out.warning = warning
    return out
  }
  if (memoryData && !lsOk) {
    lastRev = revOf(memoryData)
    return { data: clone(memoryData), source: 'memoire' }
  }
  return { data: adoptRev(defaultData(), 0), source: lsOk ? 'defaut' : 'memoire' }
}

/**
 * Enregistre les données avec une nouvelle révision : localStorage (copie de secours du
 * jour précédent), puis miroir IndexedDB. Écriture optimiste : si localStorage contient
 * une révision plus récente que celle que cette instance a lue (autre onglet, « Tout
 * effacer »), rien n'est écrit et conflict vaut true. Ne jette jamais.
 * @param {object} data AppData
 * @returns {{ok: boolean, rev: number|null, conflict: boolean, idb: Promise<'written'|'skipped'|'failed'>}}
 *   ok : localStorage écrit ; rev : révision attribuée (même si seul IndexedDB a pu être écrit)
 */
export function saveDataDetailed(data) {
  const refused = (conflict) => ({ ok: false, rev: null, conflict, idb: Promise.resolve('failed') })
  let clean
  try {
    clean = normalizeData(data)
  } catch {
    return refused(false)
  }
  const disk = peekRev()
  if (disk !== null && disk > lastRev) return refused(true)
  const rev = Math.max(disk ?? 0, lastRev, clean.meta.rev) + 1
  clean.meta.rev = rev
  const text = JSON.stringify(clean)
  memoryData = clean
  lastRev = rev
  let ok = false
  try {
    const today = localTodayISO()
    const backup = parseStored(lsGet(LS_BACKUP_KEY) || '')
    if (backup?.savedAt !== today) {
      // Première écriture de la journée : on garde l'état de la veille comme copie de secours.
      const previous = parseStored(lsGet(LS_KEY) || '')
      if (previous) lsSet(LS_BACKUP_KEY, JSON.stringify({ savedAt: today, data: previous }))
    }
    ok = lsSet(LS_KEY, text)
    if (!ok && lsGet(LS_BACKUP_KEY) !== null) {
      // Stockage plein : la copie de secours cède sa place à la version courante.
      lsRemove(LS_BACKUP_KEY)
      ok = lsSet(LS_KEY, text)
    }
  } catch {
    ok = false
  }
  return { ok, rev, conflict: false, idb: idbPutIfNewer(text, rev) }
}

/**
 * Enregistre les données (voir saveDataDetailed).
 * @param {object} data AppData
 * @returns {number|false} la nouvelle révision si localStorage a bien été écrit, sinon false
 */
export function saveData(data) {
  const res = saveDataDetailed(data)
  return res.ok ? res.rev : false
}

async function clearIDB() {
  const idb = idbFactory()
  if (!idb) return true
  // 1. Vider la clé : fonctionne même si un autre onglet garde la base ouverte.
  let emptied = false
  try {
    await idbTx('readwrite', (store) => { store.delete(IDB_KEY) })
    emptied = (await idbGetStrict()) === undefined
  } catch {
    emptied = false
  }
  // 2. Supprimer la base elle-même.
  const db = await (idbPromise ? idbPromise.catch(() => null) : null)
  try { db?.close() } catch { /* déjà fermée */ }
  idbPromise = null
  let deleted = false
  try {
    await withTimeout(new Promise((resolve, reject) => {
      const req = idb.deleteDatabase(IDB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error || new Error('IndexedDB : suppression impossible'))
      req.onblocked = () => reject(new Error('IndexedDB : suppression bloquée'))
    }), IDB_TIMEOUT_MS)
    deleted = true
  } catch {
    deleted = false
  }
  return emptied || deleted
}

/**
 * Efface toutes les données enregistrées (localStorage, copie de secours, IndexedDB, mémoire)
 * et pose le marqueur d'effacement : les autres onglets devront recharger avant d'écrire.
 * @returns {Promise<boolean>} true si l'effacement est vérifié partout
 */
export async function clearAll() {
  const resetRev = Math.max(peekRev() ?? 0, lastRev) + 1
  memoryData = null
  for (const key of [LS_KEY, LS_BACKUP_KEY, LS_CORRUPT_KEY]) lsRemove(key)
  lsSet(LS_RESET_KEY, JSON.stringify({ at: new Date().toISOString(), rev: resetRev }))
  lastRev = resetRev
  const lsClean = lsGet(LS_KEY) === null && lsGet(LS_BACKUP_KEY) === null
  const idbClean = await clearIDB()
  return lsClean && idbClean
}

// ---------------------------------------------------------------------------
// Import / export

/**
 * Sérialise une sauvegarde complète.
 * @param {object} data AppData
 * @returns {string} JSON { app: 'lune', version: 1, exportedAt, data }
 */
export function exportJSON(data) {
  return JSON.stringify({
    app: 'lune',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: normalizeData(data),
  }, null, 2)
}

function codedError(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

/** Valide le texte d'une sauvegarde en clair et renvoie le bloc de données brut. */
function parseBackupPayload(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Le fichier est vide.')
  }
  let obj
  try {
    obj = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error('Ce fichier n\'est pas une sauvegarde lisible (JSON invalide).')
  }
  if (!isPlainObject(obj)) {
    throw new Error('Ce fichier ne ressemble pas à une sauvegarde Lune.')
  }
  if (obj.format === ENC_FORMAT) {
    throw codedError('Cette sauvegarde est chiffrée : saisis ta phrase de passe pour l\'ouvrir.', 'ENCRYPTED')
  }
  let payload
  if ('app' in obj) {
    if (obj.app !== 'lune') throw new Error('Ce fichier vient d\'une autre application, pas de Lune.')
    if (Number.isInteger(obj.version) && obj.version > 1) {
      throw new Error('Cette sauvegarde vient d\'une version plus récente de Lune. Mets l\'application à jour, puis réessaie.')
    }
    payload = obj.data
  } else if ('days' in obj || 'profile' in obj || 'schema' in obj) {
    payload = obj
  } else {
    throw new Error('Ce fichier ne ressemble pas à une sauvegarde Lune.')
  }
  if (!isPlainObject(payload)) {
    throw new Error('La sauvegarde ne contient pas de données.')
  }
  if (schemaOf(payload) > SCHEMA) {
    throw new Error('Cette sauvegarde vient d\'une version plus récente de Lune. Mets l\'application à jour, puis réessaie.')
  }
  if ('days' in payload && !isPlainObject(payload.days)) {
    throw new Error('La sauvegarde est abîmée : la liste des jours est illisible.')
  }
  return payload
}

function isMeaningful(v) {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Compare les jours bruts et normalisés : ce que la normalisation a laissé de côté. */
function importReport(payload, data) {
  const skippedDays = []
  const lostCycleStarts = []
  const droppedFieldDays = []
  const rawDays = isPlainObject(payload.days) ? payload.days : {}
  for (const key of Object.keys(rawDays).sort()) {
    const raw = rawDays[key]
    const kept = data.days[key]
    if (isPlainObject(raw) && raw.cycleStart === true && !kept?.cycleStart) lostCycleStarts.push(key)
    if (!kept) {
      skippedDays.push(key)
      continue
    }
    if (!isPlainObject(raw)) continue
    const dropped = Object.keys(raw).some((field) => {
      const v = raw[field]
      if (!isMeaningful(v)) return false
      if (!(field in kept)) return true
      return Array.isArray(v) && Array.isArray(kept[field]) && kept[field].length < new Set(v).size
    })
    if (dropped) droppedFieldDays.push(key)
  }
  const profileWarnings = []
  const rawRemoval = isPlainObject(payload.profile) ? payload.profile.iudRemovalDate : undefined
  if (isMeaningful(rawRemoval) && (data.profile.iudRemovalDate === null || isImplausibleRemovalDate(data.profile.iudRemovalDate))) {
    profileWarnings.push('iudRemovalDate')
  }
  return { skippedDays, lostCycleStarts, droppedFieldDays, profileWarnings }
}

/**
 * Lit une sauvegarde en clair et détaille ce qui n'a pas pu être repris.
 * @param {string} text
 * @returns {{data: object, report: {skippedDays: string[], lostCycleStarts: string[],
 *   droppedFieldDays: string[], profileWarnings: string[]}}}
 *   skippedDays : jours écartés (date invalide ou aberrante, ou plus rien de lisible) ;
 *   lostCycleStarts : jours marqués début de règles (cycleStart) qui ne le sont plus après lecture ;
 *   droppedFieldDays : jours gardés dont au moins une information a été ignorée ;
 *   profileWarnings : champs du profil invraisemblables ou illisibles (ex. 'iudRemovalDate').
 * @throws {Error} message en français lisible ; code 'ENCRYPTED' pour un fichier chiffré
 */
export function importJSONDetailed(text) {
  const payload = parseBackupPayload(text)
  const data = normalizeData(payload)
  const rawCount = isPlainObject(payload.days) ? Object.keys(payload.days).length : 0
  if (rawCount > 0 && Object.keys(data.days).length === 0) {
    throw new Error('Aucun jour valide n\'a été trouvé dans cette sauvegarde.')
  }
  return { data, report: importReport(payload, data) }
}

/**
 * Lit une sauvegarde (format exporté ou AppData brut), la valide et la normalise.
 * @param {string} text
 * @returns {object} AppData
 * @throws {Error} message en français lisible ; code 'ENCRYPTED' pour un fichier chiffré
 */
export function importJSON(text) {
  return importJSONDetailed(text).data
}

// ---------------------------------------------------------------------------
// Sauvegarde chiffrée (format lune-enc) : PBKDF2-SHA-256 + AES-GCM 256

const ENC_FORMAT = 'lune-enc'
const ENC_ITERATIONS = 600000
const ENC_MAX_ITERATIONS = 10000000

function subtle() {
  const s = globalThis.crypto?.subtle
  if (!s || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw codedError('Le chiffrement n\'est pas disponible dans ce navigateur : la sauvegarde chiffrée est impossible ici.', 'NO_CRYPTO')
  }
  return s
}

function toBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromBase64(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(str)) throw new Error('base64')
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** En-tête canonique (ordre des clés fixe) : sert aussi de données associées (AAD). */
function encHeader({ iterations, salt, iv }) {
  return {
    app: 'lune',
    format: ENC_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    cipher: { name: 'AES-GCM', iv },
  }
}

async function deriveKey(pass, saltBytes, iterations, usage) {
  const s = subtle()
  const material = await s.importKey('raw', new TextEncoder().encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return s.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

/**
 * Sauvegarde chiffrée : le contenu de exportJSON chiffré par une phrase de passe.
 * @param {object} data AppData
 * @param {string} pass phrase de passe (non vide)
 * @returns {Promise<string>} JSON { app, format: 'lune-enc', version, kdf, cipher, ciphertext }
 * @throws {Error} code 'NO_CRYPTO' si Web Crypto est absent
 */
export async function exportEncrypted(data, pass) {
  if (typeof pass !== 'string' || pass.length === 0) throw new Error('Choisis une phrase de passe.')
  const s = subtle()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const header = encHeader({ iterations: ENC_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv) })
  const key = await deriveKey(pass, salt, ENC_ITERATIONS, 'encrypt')
  const plain = new TextEncoder().encode(exportJSON(data))
  const cipher = await s.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(JSON.stringify(header)) },
    key,
    plain,
  )
  return JSON.stringify({ ...header, ciphertext: toBase64(new Uint8Array(cipher)) }, null, 2)
}

/**
 * Déchiffre une sauvegarde lune-enc et renvoie son texte en clair (format exportJSON).
 * @param {string} text
 * @param {string} pass
 * @returns {Promise<string>}
 * @throws {Error} message en français ; code 'BAD_PASSPHRASE', 'NOT_ENCRYPTED', 'UNSUPPORTED' ou 'NO_CRYPTO'
 */
export async function decryptBackupText(text, pass) {
  let obj
  try {
    obj = JSON.parse(String(text ?? '').replace(/^﻿/, ''))
  } catch {
    obj = null
  }
  if (!isPlainObject(obj) || obj.format !== ENC_FORMAT || obj.app !== 'lune') {
    throw codedError('Ce fichier n\'est pas une sauvegarde chiffrée de Lune.', 'NOT_ENCRYPTED')
  }
  const kdf = isPlainObject(obj.kdf) ? obj.kdf : {}
  const cipherInfo = isPlainObject(obj.cipher) ? obj.cipher : {}
  if (obj.version !== 1 || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || cipherInfo.name !== 'AES-GCM'
    || !Number.isInteger(kdf.iterations) || kdf.iterations < ENC_ITERATIONS || kdf.iterations > ENC_MAX_ITERATIONS) {
    throw codedError('Cette sauvegarde chiffrée utilise des réglages non pris en charge : elle ne peut pas être ouverte.', 'UNSUPPORTED')
  }
  if (typeof pass !== 'string' || pass.length === 0) {
    throw codedError('Phrase de passe incorrecte ou fichier abîmé.', 'BAD_PASSPHRASE')
  }
  let salt
  let iv
  let ciphertext
  try {
    salt = fromBase64(kdf.salt)
    iv = fromBase64(cipherInfo.iv)
    ciphertext = fromBase64(obj.ciphertext)
  } catch {
    throw codedError('Phrase de passe incorrecte ou fichier abîmé.', 'BAD_PASSPHRASE')
  }
  const s = subtle()
  const header = encHeader({ iterations: kdf.iterations, salt: kdf.salt, iv: cipherInfo.iv })
  try {
    const key = await deriveKey(pass, salt, kdf.iterations, 'decrypt')
    const plain = await s.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(JSON.stringify(header)) },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(plain)
  } catch {
    // OperationError : mauvaise phrase, en-tête modifié ou contenu abîmé.
    throw codedError('Phrase de passe incorrecte ou fichier abîmé.', 'BAD_PASSPHRASE')
  }
}

/**
 * Déchiffre une sauvegarde lune-enc puis la lit comme importJSON.
 * @param {string} text
 * @param {string} pass
 * @param {{detailed?: boolean}} [opts] detailed : renvoie { data, report } comme importJSONDetailed
 * @returns {Promise<object>} AppData (ou { data, report } si detailed)
 * @throws {Error} voir decryptBackupText et importJSON
 */
export async function decryptBackup(text, pass, { detailed = false } = {}) {
  const plain = await decryptBackupText(text, pass)
  return detailed ? importJSONDetailed(plain) : importJSON(plain)
}

const LABELS = {
  bleeding: { spotting: 'Spotting', leger: 'Règles légères', moyen: 'Règles moyennes', abondant: 'Règles abondantes', post_retrait: 'Saignement post-retrait' },
  tempRoute: { buccale: 'Buccale', vaginale: 'Vaginale', rectale: 'Rectale' },
  tempDisturbances: { maladie: 'Maladie ou fièvre', alcool: 'Alcool', nuit_courte: 'Nuit courte', heure_inhabituelle: 'Heure inhabituelle', voyage: 'Voyage ou décalage horaire', stress: 'Stress', medicament: 'Médicament', autre: 'Autre' },
  mucusSensation: { sec: 'Sec', rien: 'Rien senti', humide: 'Humide', mouille: 'Mouillé, glissant' },
  mucusAspect: { rien: 'Rien vu', epaisse: 'Épaisse, crémeuse', filante: 'Filante, transparente' },
  cervixOpening: { ferme: 'Fermé', mi_ouvert: 'Mi-ouvert', ouvert: 'Ouvert' },
  cervixFirmness: { dur: 'Dur', mou: 'Mou' },
  cervixPosition: { bas: 'Bas', moyen: 'Moyen', haut: 'Haut' },
  lh: { negatif: 'Négatif', positif: 'Positif' },
  pregnancyTest: { negatif: 'Négatif', positif: 'Positif' },
  sex: { protege: 'Protégé', non_protege: 'Non protégé', incident: 'Incident (préservatif rompu ou glissé)' },
  emergencyContraception: { levonorgestrel: 'Lévonorgestrel', ulipristal: 'Ulipristal', diu_cuivre: 'DIU au cuivre' },
  events: { maladie: 'Maladie', voyage: 'Voyage', stress_majeur: 'Stress majeur', nouveau_medicament: 'Nouveau médicament', fausse_couche: 'Fausse couche' },
  symptoms: {
    crampes: 'Crampes', maux_tete: 'Maux de tête', ballonnements: 'Ballonnements', seins_sensibles: 'Seins sensibles',
    acne: 'Acné', fatigue: 'Fatigue', nausees: 'Nausées', mal_dos: 'Mal de dos', transit: 'Transit perturbé',
    fringales: 'Fringales', insomnie: 'Insomnie', libido_haute: 'Libido haute', libido_basse: 'Libido basse',
    douleur_ovulation: 'Douleur d\'ovulation', douleur_rapports: 'Douleur pendant les rapports',
    douleur_digestive: 'Douleur digestive', douleur_urinaire: 'Douleur urinaire', vertiges: 'Vertiges',
  },
  moods: {
    calme: 'Calme', joyeuse: 'Joyeuse', energique: 'Énergique', irritable: 'Irritable', anxieuse: 'Anxieuse',
    triste: 'Triste', sensible: 'Sensible', deprimee: 'Déprimée', concentree: 'Concentrée', sautes_humeur: 'Sautes d\'humeur',
  },
}

function label(group, id) {
  return LABELS[group][id] ?? id.replace(/_/g, ' ')
}

function labelList(group, ids) {
  return (ids || []).map((id) => label(group, id)).join(', ')
}

function fmtTempCSV(c) {
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`
}

function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  // Neutralise les formules des tableurs (« =… », « +… », « -… », « @… »).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_COLUMNS = [
  ['Date', (iso) => iso],
  ['Saignement', (iso, d) => (d.bleeding ? label('bleeding', d.bleeding) : '')],
  ['Début de cycle', (iso, d) => (d.cycleStart ? 'Oui' : '')],
  ['Température (°C)', (iso, d) => (d.temp ? fmtTempCSV(d.temp) : '')],
  ['Heure de mesure', (iso, d) => d.tempTime || ''],
  ['Voie de mesure', (iso, d) => (d.tempRoute ? label('tempRoute', d.tempRoute) : '')],
  ['Nouveau thermomètre', (iso, d) => (d.thermometerChanged ? 'Oui' : '')],
  ['Perturbations', (iso, d) => labelList('tempDisturbances', d.tempDisturbances)],
  ['Précision perturbation', (iso, d) => d.tempDisturbanceNote || ''],
  ['Valeur exclue', (iso, d) => (d.tempExcluded ? 'Oui' : '')],
  ['Glaire : sensation', (iso, d) => (d.mucusSensation ? label('mucusSensation', d.mucusSensation) : '')],
  ['Glaire : aspect', (iso, d) => (d.mucusAspect ? label('mucusAspect', d.mucusAspect) : '')],
  ['Observation douteuse', (iso, d) => (d.mucusDoubtful ? 'Oui' : '')],
  ['Col : ouverture', (iso, d) => (d.cervixOpening ? label('cervixOpening', d.cervixOpening) : '')],
  ['Col : fermeté', (iso, d) => (d.cervixFirmness ? label('cervixFirmness', d.cervixFirmness) : '')],
  ['Col : position', (iso, d) => (d.cervixPosition ? label('cervixPosition', d.cervixPosition) : '')],
  ['Test LH', (iso, d) => (d.lh ? label('lh', d.lh) : '')],
  ['Test de grossesse', (iso, d) => (d.pregnancyTest ? label('pregnancyTest', d.pregnancyTest) : '')],
  ['Rapport', (iso, d) => (d.sex ? label('sex', d.sex) : '')],
  ['Heure du rapport', (iso, d) => d.sexTime || ''],
  ['Contraception d\'urgence', (iso, d) => (d.emergencyContraception ? label('emergencyContraception', d.emergencyContraception) : '')],
  ['Heure de la prise', (iso, d) => d.emergencyContraceptionTime || ''],
  ['Cycle non évaluable', (iso, d) => (d.cycleUnevaluable ? 'Oui' : '')],
  ['Événements', (iso, d) => labelList('events', d.events)],
  ['Douleur (0 à 10)', (iso, d) => (Number.isInteger(d.pain) ? d.pain : '')],
  ['Symptômes', (iso, d) => labelList('symptoms', d.symptoms)],
  ['Humeurs', (iso, d) => labelList('moods', d.moods)],
  ['Notes', (iso, d) => d.notes || ''],
]

/**
 * Export tableur : une ligne par jour renseigné, séparateur « ; », décimales à la virgule,
 * en-têtes et valeurs en français. Préfixé d'un BOM UTF-8 pour les tableurs.
 * @param {object} data AppData
 * @returns {string}
 */
export function exportCSV(data) {
  const clean = normalizeData(data)
  const lines = [CSV_COLUMNS.map(([title]) => csvCell(title)).join(';')]
  for (const iso of Object.keys(clean.days).sort()) {
    const day = clean.days[iso]
    lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(iso, day))).join(';'))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

// ---------------------------------------------------------------------------
// Stockage persistant

/**
 * Demande au navigateur de protéger les données contre l'effacement automatique.
 * À appeler à la suite d'un geste de l'utilisatrice.
 * @returns {Promise<boolean|null>} null si l'API est absente
 */
export async function requestPersistence() {
  try {
    const storage = globalThis.navigator?.storage
    if (!storage?.persist) return null
    return await storage.persist()
  } catch {
    return null
  }
}

/**
 * État actuel de la persistance du stockage.
 * @returns {Promise<boolean|null>} null si l'API est absente
 */
export async function persistenceStatus() {
  try {
    const storage = globalThis.navigator?.storage
    if (!storage?.persisted) return null
    return await storage.persisted()
  } catch {
    return null
  }
}
