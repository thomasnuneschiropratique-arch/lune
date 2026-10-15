/**
 * Prédictions indicatives et statistiques de cycle.
 * Spec : docs/spec-medicale.md §2.7 (prédictions) et §2.9 (statistiques, FIGO 2018).
 *
 * Les prédictions sont TOUJOURS indicatives : elles n'influencent jamais l'état d'un jour
 * ni la décision « protection nécessaire ». Aucun « score de précision » n'est produit.
 */

import {
  isEligibleCycle, MAX_VALID_CYCLES, regularityOf, selectAlertCycles, selectValidCycles,
} from './regularity.js';
import { PERIOD_BLEEDING } from './cycles.js';

/* ------------------------------------------------------------------ */
/* Dates (chaînes 'YYYY-MM-DD', arithmétique calendaire via Date.UTC)  */
/* ------------------------------------------------------------------ */

const DAY_MS = 86400000;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Ajoute n jours calendaires à une date.
 * @param {string} iso 'YYYY-MM-DD'
 * @param {number} n entier (négatif possible)
 * @returns {string}
 */
export function addDays(iso, n) {
  return fromDayNumber(dayNumber(iso) + n);
}

/**
 * Nombre de jours calendaires de a à b (b − a).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function diffDays(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/**
 * Date en français, ex. « lundi 5 octobre », « jeudi 1er octobre ».
 * @param {string} iso
 * @returns {string}
 */
export function formatDateFR(iso) {
  const d = new Date(dayNumber(iso) * DAY_MS);
  const day = d.getUTCDate();
  return `${WEEKDAYS[d.getUTCDay()]} ${day === 1 ? '1er' : day} ${MONTHS[d.getUTCMonth()]}`;
}

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Étiquette obligatoire de toute prédiction (contrat §5.2). */
export const PREDICTION_LABEL = 'Estimation indicative. Ne l\'utilise pas comme contraception.';

const FIGO_MESSAGE = 'La plupart des cycles durent 24 à 38 jours (FIGO).';
const DEFAULT_LH = 12.4;          // Bull 2019, définition « température »
const DEFAULT_LH_SD = 2.4;
const PRIOR = { mu0: 29, tau0: 4.5, sigma0: 3, sigma0PostRemoval: 4, nu0: 4 };
const Z80 = 1.28;
const Z95 = 1.96;
const INFERTILE_SUITE_MAX_DAYS = 60;

/* ------------------------------------------------------------------ */
/* Sélection des cycles (regularity.js, contrat K5)                    */
/* ------------------------------------------------------------------ */

// Une seule définition de « cycle valide » et de « cycles réguliers », partagée avec le mode
// strict FSRH (cycles.js) : réexportée ici pour garder l'API du module.
export { isEligibleCycle, selectValidCycles, selectAlertCycles };

/* ------------------------------------------------------------------ */
/* Outils statistiques                                                 */
/* ------------------------------------------------------------------ */

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const round1 = (x) => Math.round(x * 10) / 10;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sampleVariance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Quantile empirique par interpolation linéaire (p ∈ [0, 1]). */
function quantile(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** erfc avec erreur relative < 1,2e-7 (Numerical Recipes, erfcc) : précis aussi dans la queue. */
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
    + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/** P(Z > x) pour Z ~ N(0, 1). */
function normUpperTail(x) {
  return 0.5 * erfc(x / Math.SQRT2);
}

/** Inverse de la fonction de répartition normale (algorithme d'Acklam). */
function normInv(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const tailPoly = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
    / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tailPoly(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tailPoly(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Loi normale N(mu, sd) tronquée à gauche en a (on sait que X > a).
 * Renvoie l'espérance E[X | X > a] et la fonction quantile conditionnelle.
 * @param {number} mu
 * @param {number} sd
 * @param {number} a
 * @returns {{ mean: number, q: (p: number) => number }}
 */
export function truncatedNormal(mu, sd, a) {
  const alpha = (a - mu) / sd;
  const tail = normUpperTail(alpha);
  if (alpha > 30 || tail <= 0) {
    // Queue extrême : l'excédent suit approximativement une loi exponentielle.
    const scale = sd / alpha;
    return { mean: a + scale, q: (p) => a - Math.log(1 - p) * scale };
  }
  return {
    mean: mu + (sd * normPdf(alpha)) / tail,
    q: (p) => mu - sd * normInv(tail * (1 - p)),
  };
}

/* ------------------------------------------------------------------ */
/* Méthode B : rétrécissement bayésien                                 */
/* ------------------------------------------------------------------ */

/**
 * Estimation bayésienne de la durée du prochain cycle (spec §2.7.1 B).
 * Exclut les valeurs aberrantes (≥ 4 cycles : |L − M| > max(3·σ_rob ; 8), σ_rob = 1,4826·MAD, plancher 1).
 * @param {number[]} lengths durées des cycles valides, ordre chronologique
 * @param {{ sigma0?: number, recentWeighting?: boolean, calibration?: number }} [opts]
 *   recentWeighting : pondération récente w = 0,5^(k/4) (k = 0 pour le plus récent) sur la moyenne.
 * @returns {{ mu: number, sdp: number, n: number, used: number[], excluded: number[] } | null}
 */
export function estimateCycleLength(lengths, { sigma0 = PRIOR.sigma0, recentWeighting = true, calibration = 1 } = {}) {
  let used = [...lengths];
  const excluded = [];
  if (lengths.length >= 4) {
    const M = median(lengths);
    const sRob = Math.max(1, 1.4826 * median(lengths.map((L) => Math.abs(L - M))));
    const limit = Math.max(3 * sRob, 8);
    used = [];
    for (const L of lengths) (Math.abs(L - M) > limit ? excluded : used).push(L);
  }
  const n = used.length;
  if (n === 0) return null;

  let xbar = mean(used);
  if (recentWeighting) {
    const w = used.map((_, i) => 0.5 ** ((n - 1 - i) / 4));
    xbar = used.reduce((s, L, i) => s + w[i] * L, 0) / w.reduce((s, x) => s + x, 0);
  }
  const { mu0, tau0, nu0 } = PRIOR;
  const sigma2 = (nu0 * sigma0 ** 2 + (n - 1) * sampleVariance(used)) / (nu0 + n - 1);
  const precision = 1 / tau0 ** 2 + n / sigma2;
  const mu = (mu0 / tau0 ** 2 + (n * xbar) / sigma2) / precision;
  const sdp = Math.sqrt(sigma2 + 1 / precision) * calibration;
  return { mu, sdp, n, used, excluded };
}

/** σ0 porté à 4 jours pendant les 3 premiers cycles post-retrait. */
function sigma0For(cycle) {
  const k = cycle?.postRemovalNumber;
  return k != null && k >= 1 && k <= 3 ? PRIOR.sigma0PostRemoval : PRIOR.sigma0;
}

/**
 * Rétro-évaluation : pour chaque cycle valide, ce qu'aurait prédit la méthode B
 * avec les cycles valides précédents (écart réel − prévu, et « dans la fenêtre 80 % »).
 * Les cycles 0 et 1 post-retrait n'ont jamais de prédiction calendaire : ignorés.
 */
function backtest(cycles, data) {
  const all = selectValidCycles(cycles, data, Infinity);
  const out = [];
  for (let i = 1; i < all.length; i++) {
    const target = all[i];
    if (target.postRemovalNumber === 1) continue;
    const training = all.slice(Math.max(0, i - MAX_VALID_CYCLES), i).map((c) => c.length);
    const est = estimateCycleLength(training, { sigma0: sigma0For(target) });
    if (!est) continue;
    const residual = target.length - est.mu;
    out.push({ residual, hit: Math.abs(residual) <= Z80 * est.sdp });
  }
  return out;
}

function confidenceFor(n, sdp) {
  if (n >= 6 && sdp <= 2.5) return 'bonne';
  if (n >= 3 && sdp <= 4) return 'moyenne';
  return 'faible';
}

/* ------------------------------------------------------------------ */
/* Phase haute (méthode A et estimation de l'ovulation)                */
/* ------------------------------------------------------------------ */

/**
 * Longueur de phase haute : moyenne personnelle si au moins 3 phases mesurées
 * (cycles valides), sinon 12,4 j (sd 2,4). sd personnel avec plancher 1.
 * @param {object[]} validCycles
 * @returns {{ mean: number, sd: number, n: number, personal: boolean }}
 */
export function highPhaseParams(validCycles) {
  const hp = validCycles.map((c) => c.highPhaseLength).filter((x) => Number.isFinite(x));
  if (hp.length < 3) return { mean: DEFAULT_LH, sd: DEFAULT_LH_SD, n: 0, personal: false };
  return { mean: mean(hp), sd: Math.max(1, Math.sqrt(sampleVariance(hp))), n: hp.length, personal: true };
}

/* ------------------------------------------------------------------ */
/* Fenêtres                                                            */
/* ------------------------------------------------------------------ */

/**
 * Projette une loi N(mu, sd) (en jours après `anchor`) en fenêtres de dates.
 * Recentrage par loi normale tronquée si aujourd'hui dépasse le centre (spec §2.7.1).
 * Les bornes basses ne sont jamais dans le passé.
 */
function projectWindow(anchor, mu, sd, today, residuals = null) {
  const t = diffDays(anchor, today);
  const center = Math.round(mu);
  let lo80 = mu - Z80 * sd;
  let hi80 = mu + Z80 * sd;
  let lo95 = mu - Z95 * sd;
  let hi95 = mu + Z95 * sd;
  if (residuals) {
    // Quantiles empiriques des écarts prévu/réel ; on garde la fenêtre la plus large (prudent).
    lo80 = Math.min(lo80, mu + quantile(residuals, 0.1));
    hi80 = Math.max(hi80, mu + quantile(residuals, 0.9));
    lo95 = Math.min(lo95, mu + quantile(residuals, 0.025));
    hi95 = Math.max(hi95, mu + quantile(residuals, 0.975));
  }
  const initialTo95 = addDays(anchor, Math.ceil(hi95));
  const late = today > initialTo95 ? { days: diffDays(initialTo95, today) } : null;

  let off;
  let lateVsEstimate = 0;
  if (t > center) {
    const tn = truncatedNormal(mu, sd, t);
    off = {
      center: Math.max(t, Math.round(tn.mean)),
      lo80: Math.floor(tn.q(0.1)), hi80: Math.ceil(tn.q(0.9)),
      lo95: Math.floor(tn.q(0.025)), hi95: Math.ceil(tn.q(0.975)),
    };
    lateVsEstimate = t - center;
  } else {
    off = { center, lo80: Math.floor(lo80), hi80: Math.ceil(hi80), lo95: Math.floor(lo95), hi95: Math.ceil(hi95) };
  }
  // Borne basse 95 % avant plancher « aujourd'hui » : sert à l'estimation de l'ovulation.
  off.lo95Raw = off.lo95;
  off.lo80 = Math.max(t, off.lo80);
  off.lo95 = Math.max(t, off.lo95);
  return {
    offsets: off,
    late,
    lateVsEstimate,
    nextPeriod: {
      date: addDays(anchor, off.center),
      initialDate: addDays(anchor, center),
      from80: addDays(anchor, off.lo80),
      to80: addDays(anchor, off.hi80),
      from95: addDays(anchor, off.lo95),
      to95: addDays(anchor, off.hi95),
    },
  };
}

function lateMessage(days) {
  return days > 0
    ? ` Tes règles sont en retard de ${days} jour${days > 1 ? 's' : ''} par rapport à l'estimation : la fenêtre a été recalculée.`
    : '';
}

/* ------------------------------------------------------------------ */
/* Méthodes                                                            */
/* ------------------------------------------------------------------ */

function methodA(current, lh, today) {
  const fhm = current.temp.fhm;
  const sd = Math.sqrt(lh.sd ** 2 + 1);
  const w = projectWindow(fhm, lh.mean, sd, today);
  const basis = lh.personal
    ? `de ta phase haute moyenne (${String(round1(lh.mean)).replace('.', ',')} jours sur ${lh.n} cycles)`
    : 'd\'une phase haute moyenne de 12,4 jours (il faut au moins 3 cycles mesurés pour utiliser la tienne)';
  return {
    pred: {
      method: 'phase_haute',
      cyclesUsed: lh.n,
      confidence: lh.personal ? 'bonne' : 'moyenne',
      nextPeriod: w.nextPeriod,
      ovulation: { from: addDays(fhm, -2), to: fhm, retrospective: true },
      fertileWindow: null,
      late: w.late,
      message: `Calculé à partir de ta montée de température du ${formatDateFR(fhm)} et ${basis}. `
        + `L'ovulation a probablement eu lieu entre le ${formatDateFR(addDays(fhm, -2))} et le ${formatDateFR(fhm)}.`
        + lateMessage(w.lateVsEstimate),
    },
    ovulationPoint: null,
  };
}

function methodB(current, valid, lh, cycles, data, today) {
  const bt = backtest(cycles, data);
  const last6 = bt.slice(-6);
  const calibration = last6.length === 6 && last6.filter((r) => r.hit).length < 0.7 * 6 ? 1.2 : 1;
  const est = estimateCycleLength(valid.map((c) => c.length), { sigma0: sigma0For(current), calibration });
  const residuals = valid.length >= 8 && bt.length >= 6 ? bt.slice(-MAX_VALID_CYCLES).map((r) => r.residual) : null;
  const w = projectWindow(current.start, est.mu, est.sdp, today, residuals);
  const o = w.offsets;

  // §2.7.2 : ovulation = règles prévues − Lh ; fenêtre ovulatoire sur la fenêtre 95 % ; fertile = −5 / +1.
  const ovFromOff = Math.max(0, Math.floor(o.lo95Raw - (lh.mean + 2 * lh.sd)));
  const ovToOff = Math.max(ovFromOff, Math.ceil(o.hi95 - (lh.mean - 2 * lh.sd)));
  const ovulationPoint = addDays(w.nextPeriod.date, -Math.round(lh.mean));

  const cu = !!current.flags?.emergencyContraception;
  let confidence = confidenceFor(est.n, est.sdp);
  if (cu) confidence = 'faible';
  const parts = [`Estimation calendaire à partir de ${est.n} cycle${est.n > 1 ? 's' : ''} valide${est.n > 1 ? 's' : ''}.`];
  if (est.excluded.length) parts.push(`${est.excluded.length} cycle${est.excluded.length > 1 ? 's' : ''} très différent${est.excluded.length > 1 ? 's' : ''} mis de côté.`);
  if (confidence === 'faible') parts.push('Confiance faible : la fenêtre est large.');
  if (cu) parts.push('Après une contraception d\'urgence, les règles peuvent arriver plus tôt ou plus tard.');
  // Limites exigées par la spec §2.7.2.
  parts.push('Du J6 au J21, chaque jour a au moins 10 % de probabilité d\'être dans la fenêtre fertile (Wilcox 2000), et les applis calendrier ne trouvent le bon jour d\'ovulation que dans 21 % des cas au mieux (Johnson 2018).');
  parts.push('Une ovulation tardive reste possible jusqu\'à la 5e ou 6e semaine.');
  return {
    pred: {
      method: 'calendrier',
      cyclesUsed: est.n,
      confidence,
      nextPeriod: w.nextPeriod,
      ovulation: { from: addDays(current.start, ovFromOff), to: addDays(current.start, ovToOff), retrospective: false },
      fertileWindow: { from: addDays(current.start, Math.max(0, ovFromOff - 5)), to: addDays(current.start, ovToOff + 1) },
      late: w.late,
      message: parts.join(' ') + lateMessage(w.lateVsEstimate),
    },
    ovulationPoint,
  };
}

/* ------------------------------------------------------------------ */
/* Jours futurs pour le calendrier                                     */
/* ------------------------------------------------------------------ */

/**
 * Saignement de type règles noté depuis le jour de bascule sans J1 confirmé (contrat K3),
 * avec un repli local sur les données si le champ manque [PRUDENT] : les deux sont cumulés.
 */
function hasUnconfirmedBleed(current, data, today) {
  if (current.flags?.unconfirmedBleed) return true;
  const sw = current.double?.infertileFrom;
  if (!sw) return false;
  const days = data?.days ?? {};
  return Object.keys(days).some((iso) => iso >= sw && iso <= today && iso >= current.start && PERIOD_BLEEDING.has(days[iso]?.bleeding));
}

function buildFutureDays(current, pred, ovulationPoint, today, data) {
  const out = {};
  const tag = (iso, t) => {
    if (iso <= today) return;
    (out[iso] ??= []).includes(t) || out[iso].push(t);
  };
  const tagRange = (from, to, t) => {
    let iso = from > today ? from : addDays(today, 1);
    for (let i = 0; iso <= to && i < 400; i++, iso = addDays(iso, 1)) tag(iso, t);
  };

  const f = current.flags ?? {};
  // Pas de « suite infertile » pendant un saignement de type règles non confirmé (EA-3) : aujourd'hui
  // est INDETERMINE avec protection, les jours suivants ne peuvent pas être annoncés infertiles.
  if (current.double?.state === 'confirme' && !current.isCycle0 && !f.emergencyContraception && !f.unevaluable
    && !hasUnconfirmedBleed(current, data, today)) {
    const cap = addDays(today, INFERTILE_SUITE_MAX_DAYS);
    const until = pred.nextPeriod && addDays(pred.nextPeriod.date, -1) < cap ? addDays(pred.nextPeriod.date, -1) : cap;
    const from = current.double.infertileFrom ? addDays(current.double.infertileFrom, 1) : addDays(today, 1);
    tagRange(from, until, 'infertile_post_suite');
  }
  if (pred.fertileWindow) tagRange(pred.fertileWindow.from, pred.fertileWindow.to, 'fertile_estime');
  if (ovulationPoint) tag(ovulationPoint, 'ovulation_estimee');
  if (pred.nextPeriod) tagRange(pred.nextPeriod.from80, pred.nextPeriod.to80, 'regles_prevues');
  return out;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Prédictions indicatives (spec §2.7) : prochaines règles (méthode A si FHM confirmée
 * dans le cycle en cours, sinon méthode B calendaire), ovulation, fenêtre fertile,
 * retard, jours futurs du calendrier.
 * Aucune prédiction calendaire pendant le cycle 0 et le cycle 1 post-retrait.
 * En plus des champs du contrat, `nextPeriod.initialDate` donne la date centrale AVANT
 * recentrage (fixe pendant tout le cycle) : sert au rappel « règles attendues + 5 jours » (§6.4).
 * @param {object[]} cycles Cycle[] (le dernier est le cycle en cours)
 * @param {object} _stats Stats (non utilisées : les paramètres sont recalculés à partir des cycles)
 * @param {object} data AppData
 * @param {{ today: string, time?: string }} now
 * @returns {object} Predictions
 */
export function computePredictions(cycles, _stats, data, now) {
  const base = {
    method: 'aucune', cyclesUsed: 0, confidence: null, nextPeriod: null, ovulation: null,
    fertileWindow: null, late: null, message: FIGO_MESSAGE, label: PREDICTION_LABEL, futureDays: {},
  };
  const current = cycles?.length ? cycles[cycles.length - 1] : null;
  if (!current) return base;

  const today = now.today;
  const valid = selectValidCycles(cycles, data);
  const lh = highPhaseParams(valid);
  const f = current.flags ?? {};
  const suspended = !!(f.emergencyContraception || f.unevaluable);
  const fhmConfirmed = current.temp?.state === 'confirmee' && !!current.temp.fhm && !suspended;
  const earlyPostRemoval = current.isCycle0 || current.postRemovalNumber === 0 || current.postRemovalNumber === 1;

  let result;
  if (fhmConfirmed) {
    result = methodA(current, lh, today);
  } else if (earlyPostRemoval) {
    result = {
      pred: {
        ...base,
        message: (current.postRemovalNumber === 0
          ? 'Pas d\'estimation de date avant tes premières règles après le retrait.'
          : current.isCycle0
            ? 'Pas d\'estimation de date avant tes premières règles notées.'
            : 'Pas d\'estimation calendaire pendant le 1er cycle après le retrait : ton cycle se remet en place.')
          + ' Une estimation sera possible dès qu\'une montée de température sera confirmée. ' + FIGO_MESSAGE,
      },
      ovulationPoint: null,
    };
  } else if (valid.length === 0) {
    result = { pred: { ...base }, ovulationPoint: null };
  } else {
    result = methodB(current, valid, lh, cycles, data, today);
  }
  const pred = { ...base, ...result.pred };
  pred.futureDays = buildFutureDays(current, pred, result.ovulationPoint, today, data);
  return pred;
}

function countMissingTemps(c, data, today) {
  const last = c.end ?? today;
  let missing = 0;
  for (let iso = c.start; iso <= last; iso = addDays(iso, 1)) {
    const t = data?.days?.[iso]?.temp;
    if (!Number.isInteger(t) && iso !== today) missing++;
  }
  return missing;
}

/**
 * Statistiques sur les cycles valides (spec §2.9) : durées, règles, phase haute,
 * FHM la plus précoce, D du cycle en cours, régularité FIGO selon l'âge,
 * jours fertiles par cycle et historique de tous les cycles.
 * @param {object[]} cycles Cycle[]
 * @param {object} data AppData
 * @param {{ today: string }} now
 * @param {object|null} [days] map { iso: DayStatus } ; nécessaire pour fertileDaysPerCycle (sinon [])
 * @returns {object} Stats
 */
export function computeStats(cycles = [], data, now, days = null) {
  const today = now.today;
  const valid = selectValidCycles(cycles, data);
  const lengths = valid.map((c) => c.length);
  const current = cycles.length ? cycles[cycles.length - 1] : null;

  const cycleLength = lengths.length ? {
    mean: round1(mean(lengths)),
    median: median(lengths),
    sd: lengths.length >= 2 ? round1(Math.sqrt(sampleVariance(lengths))) : null,
    min: Math.min(...lengths),
    max: Math.max(...lengths),
  } : null;

  const periods = valid.map((c) => c.periodLength).filter((x) => x > 0);
  const periodLength = periods.length
    ? { mean: round1(mean(periods)), min: Math.min(...periods), max: Math.max(...periods) } : null;

  const hp = valid.map((c) => c.highPhaseLength).filter((x) => Number.isFinite(x));
  const highPhase = hp.length
    ? { mean: round1(mean(hp)), min: Math.min(...hp), max: Math.max(...hp), n: hp.length } : null;

  // FHM la plus précoce : celle qui sert au calcul de D (affichée pour vérification).
  const priorFhm = cycles.slice(0, -1)
    .filter((c) => !c.isCycle0 && c.temp?.state === 'confirmee' && Number.isFinite(c.temp.fhmCycleDay))
    .map((c) => c.temp.fhmCycleDay);
  const earliest = current?.pre?.earliestFhmDay ?? (priorFhm.length ? Math.min(...priorFhm) : null);
  const validFhm = valid.map((c) => c.temp?.fhmCycleDay).filter((x) => Number.isFinite(x));
  const fhmDay = earliest != null || validFhm.length
    ? { earliest, mean: validFhm.length ? round1(mean(validFhm)) : null } : null;

  // Même calcul que la levée du mode strict FSRH (regularity.js) ; forme du contrat §5.2 gardée.
  const { status, spread, threshold } = regularityOf(cycles, data, today);
  const regularity = { status, spread, threshold };

  const fertileDaysPerCycle = days ? valid.map((c) => {
    let n = 0;
    for (let iso = c.start; iso <= c.end; iso = addDays(iso, 1)) if (days[iso]?.protectionNeeded === true) n++;
    return n;
  }) : [];

  const history = cycles.map((c) => ({
    index: c.index,
    start: c.start,
    length: c.length,
    periodLength: c.periodLength,
    fhmDay: c.temp?.fhmCycleDay ?? null,
    highPhase: c.highPhaseLength ?? null,
    peakDay: c.sign?.peakDay ? diffDays(c.start, c.sign.peakDay) + 1 : null,
    ovulatory: c.temp?.state === 'confirmee',
    atypical: !!c.flags?.atypical,
    exclusions: c.temp?.excludedDays?.length ?? 0,
    missingTemps: countMissingTemps(c, data, today),
  }));

  return {
    validCycles: valid.length,
    cycleLength,
    periodLength,
    highPhase,
    fhmDay,
    currentD: current?.pre?.D ?? 0,
    regularity,
    fertileDaysPerCycle,
    history,
  };
}
