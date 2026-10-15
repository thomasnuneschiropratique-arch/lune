// Point d'entrée unique du moteur pour l'UI : analyze(data, now) → Analysis (contrat §5.2).
// Pur et déterministe : ne lit jamais l'horloge. Ne jette jamais : en cas d'erreur interne,
// renvoie un état INDETERMINE avec protection nécessaire et une alerte.

import { isValidISO, parseTime } from './dates.js';
import { analyzeCycles, HEADLINES, normalizeEngineData, STATES } from './fertility.js';

// Verdict d'un rapport noté un jour donné (contrat K2), pour l'UI et les alertes.
export { sexNeedsProtection } from './fertility.js';
import { computePredictions, computeStats } from './predict.js';
import { computeAlerts } from './alerts.js';

const LEVEL_ORDER = { urgent: 0, attention: 1, info: 2 };
const PREDICTION_LABEL = 'Estimation indicative. Ne l\'utilise pas comme contraception.';

function emptyStats() {
  return {
    validCycles: 0, cycleLength: null, periodLength: null, highPhase: null, fhmDay: null, currentD: 0,
    regularity: { status: 'inconnu', spread: null, threshold: null }, fertileDaysPerCycle: [], history: [],
  };
}

function emptyPredictions() {
  return {
    method: 'aucune', cyclesUsed: 0, confidence: null, nextPeriod: null, ovulation: null, fertileWindow: null,
    late: null, message: 'La plupart des cycles durent 24 à 38 jours (FIGO).', label: PREDICTION_LABEL, futureDays: {},
  };
}

function engineAlert(part) {
  return {
    id: `moteur-erreur:${part}`,
    level: 'attention',
    title: part === 'statut' ? 'Calcul du statut impossible' : 'Calcul partiel',
    text: part === 'statut'
      ? 'Une erreur empêche de calculer ton statut. Par prudence, considère chaque jour comme fertile et utilise une protection. Exporte une sauvegarde de tes données et vérifie tes dernières saisies.'
      : `Une erreur empêche de calculer ${part}. Ton statut du jour n'est pas concerné. Exporte une sauvegarde de tes données par précaution.`,
    action: { label: 'Ouvrir les réglages', route: 'reglages', params: {} },
  };
}

/** État de repli : aujourd'hui INDETERMINE, protection nécessaire. */
function fallbackAnalysis(now) {
  const today = isValidISO(now.today) ? now.today : null;
  const status = {
    iso: today, cycleIndex: null, cycleDay: null, phase: 'inconnue', state: STATES.INDETERMINE,
    stateReason: 'Calcul impossible : considère ce jour comme fertile',
    overlays: [], protectionNeeded: true,
    decisionReason: 'Protection nécessaire : le calcul a échoué, et toute donnée en erreur est traitée comme fertile.',
    eveningSwitch: null,
    markers: { reference: false, high: null, ignored: false, excluded: false, peak: false, peakPlus: null, fhm: false, confirm: false, missingTemp: true, missingSign: true },
  };
  return {
    now,
    cycles: [],
    current: {
      cycleIndex: null, cycleDay: null, isCycle0: false, postRemovalNumber: null, status,
      headline: HEADLINES.protection,
      detail: 'Le calcul de ton statut a échoué. Par prudence, utilise une protection à chaque rapport.',
      nextSteps: ['Exporte une sauvegarde de tes données depuis les réglages.', 'Vérifie tes dernières saisies (dates, températures).'],
      todo: { temp: false, sign: false, bleeding: false },
    },
    days: today ? { [today]: status } : {},
    predictions: emptyPredictions(),
    stats: emptyStats(),
    alerts: [engineAlert('statut')],
  };
}

/**
 * Analyse complète des données (contrat §5.2).
 * @param {object} data AppData (store.js) ; données vides ou partielles acceptées
 * @param {{ today: string, time: string }} now date et heure locales de l'appareil
 * @returns {{ now: object, cycles: object[], current: object|null, days: object,
 *   predictions: object, stats: object, alerts: object[] }}
 */
export function analyze(data, now) {
  const safeNow = {
    today: now && typeof now.today === 'string' ? now.today : null,
    time: now && parseTime(now.time) !== null ? now.time : '00:00',
  };
  let core;
  try {
    core = analyzeCycles(data, safeNow);
  } catch {
    return fallbackAnalysis(safeNow);
  }
  const { cycles, days, current } = core;

  // Les modules indicatifs reçoivent des données nettoyées ; leurs erreurs ne touchent jamais le statut.
  const clean = normalizeEngineData(data);
  const src = data && typeof data === 'object' ? data : {};
  const safeData = { ...src, profile: { ...(src.profile && typeof src.profile === 'object' ? src.profile : {}), ...clean.profile }, rules: clean.rules, days: clean.days };
  const extraAlerts = [];
  let stats;
  let predictions;
  let alerts;
  try {
    stats = computeStats(cycles, safeData, safeNow, days);
  } catch {
    stats = emptyStats();
    extraAlerts.push(engineAlert('les statistiques'));
  }
  try {
    predictions = computePredictions(cycles, stats, safeData, safeNow);
  } catch {
    predictions = emptyPredictions();
    extraAlerts.push(engineAlert('les prévisions'));
  }
  try {
    alerts = computeAlerts({ cycles, days, predictions, stats, data: safeData, now: safeNow });
  } catch {
    alerts = [];
    extraAlerts.push(engineAlert('les alertes santé'));
  }
  const all = [...alerts, ...extraAlerts]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (LEVEL_ORDER[x.a.level] ?? 3) - (LEVEL_ORDER[y.a.level] ?? 3) || x.i - y.i)
    .map(({ a }) => a);
  return { now: safeNow, cycles, current, days, predictions, stats, alerts: all };
}
