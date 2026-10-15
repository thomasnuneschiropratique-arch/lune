// Données de démonstration : DIU au cuivre retiré il y a un peu plus de 100 jours,
// cycle 0 très court, 3 cycles complets puis un cycle en cours (J20) en phase
// post-ovulatoire confirmée par double contrôle. Déterministe (PRNG à graine fixe).
//
// Construction des températures (centièmes) :
// - phase basse : valeurs brutes 36,25–36,47 et, au moins une fois sur cinq valeurs
//   valides, une valeur arrondie à 36,50. Toute fenêtre de 6 valeurs basses a donc
//   36,50 pour maximum : aucune valeur basse ne peut être une « 1re valeur haute ».
// - montée : ligne auxiliaire 36,50, valeurs hautes ≥ 36,70 (règle régulière),
//   ou 36,60 · 36,65 · 36,65 · 36,75 pour le cycle en exception 1.

import { defaultData } from './store.js'

const SEED = 20261005

/** PRNG mulberry32 : renvoie une fonction → flottant dans [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function addDays(iso, n) {
  const t = new Date(toUTC(iso) + n * 86400000)
  const p = (x) => String(x).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`
}

function weekday(iso) {
  return new Date(toUTC(iso)).getUTCDay() // 0 = dimanche
}

function hhmm(totalMinutes) {
  const p = (x) => String(x).padStart(2, '0')
  return `${p(Math.floor(totalMinutes / 60))}:${p(totalMinutes % 60)}`
}

/*
 * Plan des cycles (jours de cycle, J1 = 1).
 * length : null pour le cycle en cours. fhm : 1re valeur haute. peak : jour sommet de glaire.
 * missingTemp : jours sans mesure. alcohol : jour d'une valeur exclue (alcool).
 * lhPositive : test LH positif (veille de la montée). exception1 : montée lente.
 */
const PLAN = [
  { length: 28, period: ['moyen', 'abondant', 'moyen', 'leger', 'leger'], fhm: 15, peak: 14, missingTemp: [2, 24], lhNegative: [], lhPositive: null, exception1: false, sexProtected: [10, 23] },
  { length: 27, period: ['abondant', 'abondant', 'moyen', 'leger'], fhm: 14, peak: 13, missingTemp: [], lhNegative: [], lhPositive: null, exception1: true, sexProtected: [8, 21] },
  { length: 29, period: ['moyen', 'abondant', 'moyen', 'leger', 'leger'], fhm: 16, peak: 15, missingTemp: [22], alcohol: 8, lhNegative: [13, 14], lhPositive: 15, exception1: false, sexProtected: [11, 25] },
  { length: null, period: ['moyen', 'abondant', 'moyen', 'leger', 'leger'], fhm: 14, peak: 13, missingTemp: [3], lhNegative: [11, 12], lhPositive: null, exception1: false, sexProtected: [9, 18] },
]
const CURRENT_CYCLE_DAY = 20
const CYCLE0_DAYS = 3

/** Glaire du jour selon la distance k au sommet (k = jour − sommet). */
function mucusFor(k, rng) {
  if (k <= -5) return { mucusSensation: 'sec', mucusAspect: 'rien' }
  if (k <= -3) return { mucusSensation: 'rien', mucusAspect: 'rien' }
  if (k === -2) return { mucusSensation: 'humide', mucusAspect: 'rien' }
  if (k === -1) return { mucusSensation: 'humide', mucusAspect: 'epaisse' }
  if (k === 0) return { mucusSensation: 'mouille', mucusAspect: 'filante' }
  if (k <= 3) return { mucusSensation: 'sec', mucusAspect: 'rien' }
  return { mucusSensation: rng() < 0.65 ? 'sec' : 'rien', mucusAspect: 'rien' }
}

/** Valeurs de la montée (brutes, centièmes) pour les jours fhm, fhm+1, … */
function riseValues(exception1, rng) {
  if (exception1) return [3660, 3663, 3664, 3677]
  return [3672 + Math.floor(rng() * 8), 3674 + Math.floor(rng() * 10), 3676 + Math.floor(rng() * 10)]
}

/**
 * Génère un jeu de données de démonstration complet, relatif à todayISO.
 * Aucun jour postérieur à todayISO. Résultat identique à chaque appel pour une même date.
 * @param {string} todayISO 'YYYY-MM-DD'
 * @returns {object} AppData
 */
export function generateDemo(todayISO) {
  const rng = mulberry32(SEED)
  const data = defaultData()
  const days = {}
  const set = (iso, patch) => {
    if (iso > todayISO) return
    days[iso] = { ...(days[iso] || {}), ...patch }
  }

  // Dates de début de chaque cycle, en remontant depuis aujourd'hui.
  const starts = []
  let start = addDays(todayISO, -(CURRENT_CYCLE_DAY - 1))
  for (let i = PLAN.length - 1; i >= 0; i--) {
    starts[i] = start
    if (i > 0) start = addDays(start, -PLAN[i - 1].length)
  }
  const removal = addDays(starts[0], -CYCLE0_DAYS)

  const measure = (iso, temp) => {
    const late = weekday(iso) === 0 || weekday(iso) === 6 ? 35 : 0
    const minutes = 7 * 60 - 20 + late + Math.floor(rng() * 41)
    set(iso, { temp, tempTime: hhmm(minutes), tempRoute: 'buccale' })
  }

  // Cycle 0 : retrait au cuivre en fin de phase haute du cycle précédent.
  ;[3668, 3661, 3654].forEach((t, i) => measure(addDays(removal, i), t))
  set(removal, { bleeding: 'post_retrait', pain: 3, symptoms: ['crampes'], notes: 'Retrait du stérilet ce matin. Quelques saignements après la pose du spéculum.' })
  set(addDays(removal, 1), { bleeding: 'spotting' })

  PLAN.forEach((cycle, ci) => {
    const j1 = starts[ci]
    const lastDay = cycle.length ?? CURRENT_CYCLE_DAY
    const rise = riseValues(cycle.exception1, rng)
    let lowIndex = 0

    for (let d = 1; d <= lastDay; d++) {
      const iso = addDays(j1, d - 1)
      const k = d - cycle.peak

      // Saignements, symptômes et humeurs.
      const bleeding = cycle.period[d - 1]
      if (bleeding) set(iso, { bleeding })
      if (d === 1) set(iso, { cycleStart: true, pain: 4 + Math.floor(rng() * 3), symptoms: ['crampes', 'fatigue'], moods: ['sensible'] })
      if (d === 2) set(iso, { pain: 2 + Math.floor(rng() * 3), symptoms: ['crampes'] })
      if (d === 3 && rng() < 0.6) set(iso, { pain: 1, symptoms: ['mal_dos'] })
      if (k >= -2 && k <= -1 && rng() < 0.5) set(iso, { moods: ['energique', 'joyeuse'] })
      if (k === 0 && ci === 1) set(iso, { symptoms: ['douleur_ovulation'] })
      if (k === 0 && ci === 2) set(iso, { symptoms: ['libido_haute'], moods: ['joyeuse'] })
      if (cycle.length && d >= cycle.length - 2) {
        set(iso, { symptoms: d === cycle.length ? ['seins_sensibles', 'ballonnements'] : ['seins_sensibles'] })
        if (d === cycle.length - 1) set(iso, { moods: ['irritable'] })
      }

      // Glaire : observée chaque jour hors règles.
      if (!bleeding) set(iso, mucusFor(k, rng))

      // Tests LH et rapports protégés.
      if (cycle.lhNegative.includes(d)) set(iso, { lh: 'negatif' })
      if (cycle.lhPositive === d) set(iso, { lh: 'positif' })
      if (cycle.sexProtected.includes(d)) set(iso, { sex: 'protege', sexTime: '22:30' })

      // Température.
      if (cycle.missingTemp.includes(d)) continue
      if (cycle.alcohol === d) {
        measure(iso, 3672)
        set(iso, { tempDisturbances: ['alcool'], tempExcluded: true, notes: 'Soirée d\'anniversaire, quelques verres.' })
        continue
      }
      if (d < cycle.fhm) {
        const temp = lowIndex % 5 === 1 ? 3648 + Math.floor(rng() * 3) : 3625 + Math.floor(rng() * 23)
        lowIndex++
        measure(iso, temp)
      } else if (d - cycle.fhm < rise.length) {
        measure(iso, rise[d - cycle.fhm])
      } else if (cycle.length && d === cycle.length) {
        measure(iso, 3660 + Math.floor(rng() * 6)) // baisse la veille des règles
      } else {
        measure(iso, 3670 + Math.floor(rng() * 23))
      }
    }
  })

  data.createdAt = removal
  data.profile = {
    ...data.profile,
    iudType: 'cuivre',
    iudModel: 'TT380',
    iudRemovalDate: removal,
    iudRemovalTime: '10:30',
    rnpBeforeRemoval: 'non',
    birthYear: 1994,
    tempRoute: 'buccale',
    secondarySign: 'glaire',
    usualWakeTime: '07:00',
    onboardingDone: true,
    disclaimerAcceptedAt: removal,
  }
  data.days = Object.fromEntries(Object.keys(days).sort().map((iso) => [iso, days[iso]]))
  return data
}
