// Statut de fertilité (spec §2.4 à §2.6, §3.1) : double contrôle, début de cycle (D, règle
// des 5 jours / moins 8), priorité de l'observation, état de chaque jour et décision
// « protection nécessaire ». Fertile par défaut : toute donnée manquante, en attente,
// suspendue ou douteuse laisse la protection nécessaire.

import { addDays, cycleDay, diffDays, endDot, formatDateFR, isValidISO, maxDate, parseTime, range } from './dates.js';
import { evaluateTemperature, isValidTemp } from './temperature.js';
import { ANY_BLEEDING, cervixValue, evaluateCervix, evaluateMucus, MUCUS_CODES, mucusValue } from './mucus.js';
import { buildSegments, computeFlags, PERIOD_BLEEDING, periodDays, segmentLength, SHORT_CYCLE_DAYS } from './cycles.js';

/** Codes d'état d'un jour (contrat §5.2 DayStatus.state). */
export const STATES = Object.freeze({
  FERTILE: 'FERTILE',
  INDETERMINE: 'INDETERMINE',
  FERTILE_JUSQU_A_18H: 'FERTILE_JUSQU_A_18H',
  INFERTILE_PRE: 'INFERTILE_PRE',
  INFERTILE_POST: 'INFERTILE_POST',
});

/** Titres exacts de la décision du jour (contrat §5.2 CurrentState.headline). */
export const HEADLINES = Object.freeze({
  protection: 'Protection nécessaire',
  libre: 'Pas de protection nécessaire selon les règles',
  soir: 'Protection nécessaire jusqu\'à 18 h',
});

/** Heure locale de la bascule du soir (spec §2.1 « Soir » [CHOIX]). */
export const EVENING_MINUTES = 18 * 60;
/** Même heure, au format 'HH:MM' (contrat K1 DayStatus.eveningSwitch.at). */
export const EVENING_TIME = '18:00';

const HHMM_RE = /^\d{2}:\d{2}$/;

const RULE_NAMES = { reguliere: 'règle régulière', exception1: 'exception 1', exception2: 'exception 2' };
const PRE_RULE_LABELS = { cinq_jours: 'Règle des 5 jours', moins_8: 'Règle du moins 8' };
const IUD_TYPES = ['cuivre', 'hormonal', 'inconnu'];
const ROUTES = ['buccale', 'vaginale', 'rectale'];

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const stripDot = (s) => (s && s.endsWith('.') ? s.slice(0, -1) : s);
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Un rapport noté un jour donné demandait-il une protection (contrat K2) ?
 * Ne dépend que du statut du jour et de l'heure du rapport, jamais de l'heure de l'analyse.
 * - cycle 0 ou statut absent → true ;
 * - jour de bascule (status.eveningSwitch) : protection si l'heure est inconnue ou invalide,
 *   antérieure à 18:00, ou si un blocage maintient la protection toute la journée ;
 * - sinon : la décision du jour (status.protectionNeeded), protection par défaut.
 * @param {object|null|undefined} status DayStatus
 * @param {string|null|undefined} sexTime 'HH:MM'
 * @param {{ cycle0?: boolean }} [opts]
 * @returns {boolean}
 */
export function sexNeedsProtection(status, sexTime, { cycle0 = false } = {}) {
  if (cycle0 || !status) return true;
  const sw = status.eveningSwitch;
  if (sw) {
    // Heure valide : format HH:MM, et heure réelle (00:00 à 23:59) [PRUDENT].
    const valid = typeof sexTime === 'string' && HHMM_RE.test(sexTime) && parseTime(sexTime) !== null;
    return !valid || sexTime < sw.at || sw.blocked !== false;
  }
  return status.protectionNeeded !== false;
}

/**
 * Données nettoyées pour le moteur : jamais d'exception sur une donnée partielle ou corrompue.
 * Réglages absents → valeurs prudentes (apprentissage auto, règle de début de cycle désactivée).
 * @param {unknown} raw AppData
 * @returns {{ profile: object, rules: object, days: object }}
 */
export function normalizeEngineData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const p = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const r = src.rules && typeof src.rules === 'object' ? src.rules : {};
  const days = {};
  if (src.days && typeof src.days === 'object') {
    for (const [iso, e] of Object.entries(src.days)) {
      if (isValidISO(iso) && e && typeof e === 'object' && !Array.isArray(e)) days[iso] = e;
    }
  }
  return {
    profile: {
      iudType: IUD_TYPES.includes(p.iudType) ? p.iudType : null,
      iudRemovalDate: isValidISO(p.iudRemovalDate) ? p.iudRemovalDate : null,
      tempRoute: ROUTES.includes(p.tempRoute) ? p.tempRoute : 'buccale',
      secondarySign: p.secondarySign === 'col' ? 'col' : 'glaire',
      birthYear: Number.isInteger(p.birthYear) ? p.birthYear : null,
    },
    rules: {
      learningMode: r.learningMode === 'off' ? 'off' : 'auto',
      strictFSRH: r.strictFSRH === true,
      preOvulatoryRule: r.preOvulatoryRule === true,
      postHormonalCopper: r.postHormonalCopper === true,
    },
    days,
  };
}

/**
 * Nombre de jours infertiles en début de cycle (spec §2.5.1-2.5.2).
 * - conditions préalables : cycle précédent suivi, à J1 connu, double contrôle confirmé, ni non évaluable
 *   ni contraception d'urgence ; cycle ni « cycle 0 », ni cycle 1 post-retrait, ni avant retrait ;
 * - D = 5 ; moins 8 sur la FHM la plus précoce À VIE (toute montée confirmée, glaire validée ou non,
 *   y compris une montée écartée seulement à cause d'un test LH positif : temp.minus8FhmCycleDay) :
 *   raccourcit immédiatement si < 5, allonge seulement après ≥ 12 cycles avec FHM depuis le retrait ;
 * - D ≤ 0 → 0 ; règle désactivée (rules.preOvulatoryRule !== true) → D = 0.
 * @param {{ segment: object, previous: object[], rules: object, hasRemoval?: boolean }} input
 *   segment : { isCycle0, postRemovalNumber, preRemoval } ; previous : Cycle[] antérieurs (avec startKnown, number)
 * @returns {{ D: number, rule: 'cinq_jours'|'moins_8'|null, earliestFhmDay: number|null, conditionsMet: boolean,
 *   blockedReason: string|null, lastInfertileDay: null, cyclesWithFhmSinceRemoval: number }}
 */
export function computeD({ segment, previous, rules, hasRemoval = false }) {
  // FHM de chaque cycle antérieur à J1 connu : la plus précoce entre celle de l'évaluation retenue
  // (montée confirmée) et celle calculée sans le rejet LH (minus8FhmCycleDay, spec §2.5.2) : un test
  // LH positif ne peut jamais retirer une montée du calcul du moins 8.
  const hm = previous
    .filter((c) => c.startKnown)
    .map((c) => {
      const vals = [];
      if (c.temp.confirmDay !== null && Number.isInteger(c.temp.fhmCycleDay)) vals.push(c.temp.fhmCycleDay);
      if (Number.isInteger(c.temp.minus8FhmCycleDay)) vals.push(c.temp.minus8FhmCycleDay);
      return vals.length ? Math.min(...vals) : null;
    })
    .filter((x) => x !== null);
  const earliestFhmDay = hm.length ? Math.min(...hm) : null;
  const sinceRemoval = previous.filter((c) => c.number !== null && c.number >= 1 && c.temp.state === 'confirmee').length;
  const prev = previous.length ? previous[previous.length - 1] : null;

  let blocked = null;
  if (segment.preRemoval) blocked = 'Période sous stérilet (historique).';
  else if (segment.isCycle0) blocked = hasRemoval ? 'Cycle 0, du retrait aux premières règles.' : 'Début du cycle inconnu.';
  else if (segment.postRemovalNumber === 1) blocked = '1er cycle après le retrait du stérilet.';
  else if (!prev || prev.isCycle0) blocked = 'Cycle précédent pas suivi en entier dans l\'application.';
  else if (prev.flags.unevaluable) blocked = 'Cycle précédent non évaluable.';
  else if (prev.flags.emergencyContraception) blocked = 'Contraception d\'urgence au cycle précédent.';
  else if (prev.double.state !== 'confirme') blocked = 'Pas de double contrôle confirmé au cycle précédent.';
  const conditionsMet = blocked === null;

  let D = 0;
  let rule = null;
  if (conditionsMet) {
    D = 5;
    rule = 'cinq_jours';
    if (earliestFhmDay !== null) {
      const m8 = earliestFhmDay - 8;
      if (m8 < 5 || sinceRemoval >= 12) {
        D = m8;
        rule = 'moins_8';
      }
    }
    if (D <= 0) {
      D = 0;
      blocked = `Règle du moins 8 avec une 1re température haute au J${earliestFhmDay} au plus tôt, ce qui ne laisse aucun jour.`;
    }
  }
  const base = { earliestFhmDay, conditionsMet, lastInfertileDay: null, cyclesWithFhmSinceRemoval: sinceRemoval };
  if (rules.preOvulatoryRule !== true) {
    return { D: 0, rule: null, blockedReason: 'Règle de début de cycle désactivée, réglage par défaut.', ...base };
  }
  return { D, rule, blockedReason: D > 0 ? null : blocked, ...base };
}

/** Le jour remplit-il la priorité de l'observation (spec §2.5.3) ? */
function preDayCheck(entry, inPeriod, mucusQ, cervix, kind) {
  if (inPeriod) {
    // Observation non exigée pendant les règles ; un signe fertile noté quand même fait foi [PRUDENT].
    if (mucusQ !== null && mucusQ >= 2) return { ok: false, why: `Glaire ${MUCUS_CODES[mucusQ]} notée pendant les règles, fertile jusqu'au double contrôle` };
    if (kind === 'col' && cervix === 1) return { ok: false, why: 'Col modifié pendant les règles, fertile jusqu\'au double contrôle' };
    return { ok: true };
  }
  if (entry && entry.bleeding) return { ok: false, why: 'Saignement hors règles (compte comme une glaire S+), fertile jusqu\'au double contrôle' };
  if (mucusQ !== null && mucusQ >= 2) return { ok: false, why: `Glaire ${MUCUS_CODES[mucusQ]} observée, fertile jusqu'au double contrôle` };
  if (kind === 'col' && cervix === 1) return { ok: false, why: 'Col modifié, fertile jusqu\'au double contrôle' };
  if (entry && entry.mucusDoubtful === true) return { ok: false, why: 'Observation de glaire douteuse, fertile jusqu\'au double contrôle' };
  if (mucusQ === null || (kind === 'col' && cervix === null)) {
    return { ok: false, pending: true, why: `${kind === 'col' ? 'Glaire ou col non observés' : 'Glaire non observée'}, fertile jusqu'au double contrôle` };
  }
  return { ok: true };
}

/**
 * Évalue un segment : drapeaux, température, signe associé, double contrôle, D, statuts des jours.
 * @returns {{ cycle: object, statuses: object, blockersByIso: Map<string, object[]> }}
 */
function evaluateCycle(seg, index, ctx, previous) {
  const { data, today, minutes } = ctx;
  const entries = data.days;
  const R = data.profile.iudRemovalDate;
  const lastDay = seg.end !== null && seg.end < today ? seg.end : today;
  const isos = range(seg.start, lastDay);
  const period = seg.startKnown ? periodDays(entries, seg.start, seg.end, today) : [];
  const periodSet = new Set(period);
  const { flags, unevaluable } = computeFlags(seg, { data, today, isos, previous });
  const startLabel = seg.startKnown ? seg.start : null;
  const fd = (iso) => formatDateFR(iso);
  const lab = (iso) => (startLabel ? `J${cycleDay(seg.start, iso)} (${fd(iso)})` : fd(iso));
  const warnings = [];

  // --- Température (valeurs antérieures à un changement de voie ou de thermomètre seulement) ---
  const cut = unevaluable.cutOn ?? null;
  const records = [];
  for (const iso of isos) {
    if (cut && iso >= cut) break;
    const e = entries[iso];
    if (e && (isValidTemp(e.temp) || e.tempExcluded === true)) {
      records.push({ iso, temp: e.temp, excluded: e.tempExcluded === true, disturbances: e.tempDisturbances });
    }
  }
  const lhPositive = isos.filter((iso) => entries[iso]?.lh === 'positif');
  const extra = flags.postHormonal ? 1 : 0;
  const temp = evaluateTemperature(records, { extra, lhPositive, start: startLabel });
  temp.fhmCycleDay = temp.fhm ? cycleDay(seg.start, temp.fhm) : null;
  // Moins 8 (spec §2.5.2) : FHM calculée sans le rejet LH, sur les mêmes valeurs (coupées au changement).
  const t8 = lhPositive.length ? evaluateTemperature(records, { extra, start: startLabel }) : temp;
  temp.minus8FhmCycleDay = t8.state === 'confirmee' && t8.fhm ? cycleDay(seg.start, t8.fhm) : null;
  // État thermique brut, avant toute déclaration « non évaluable » (contrat K4).
  temp.evaluatedState = temp.state;
  if (unevaluable.declaredOn) {
    temp.state = 'non_evaluable';
    temp.explanation = `Cycle déclaré non évaluable : il est entièrement fertile. Pour information : ${temp.explanation}`;
  } else if (cut) {
    const what = cut === unevaluable.routeChangeOn ? 'Changement de voie de mesure' : 'Changement de thermomètre';
    const note = `${what} le ${fd(cut)} : les valeurs ne sont plus comparables, le cycle est non évaluable à partir de ce jour.`;
    if (temp.state !== 'confirmee') temp.state = 'non_evaluable';
    temp.explanation = `${note} ${temp.explanation}`;
  }

  // --- Signe associé : glaire (défaut) ou col ---
  const kind = data.profile.secondarySign;
  const valueOf = kind === 'col' ? cervixValue : mucusValue;
  // Glaire : un saignement hors règles est marqué (bleed) pour ne jamais devenir le sommet devant
  // une glaire fertile observée ensuite [PRUDENT, EC-2] ; le col garde son échelle binaire.
  const seq = isos.map((iso) => ({
    iso,
    q: periodSet.has(iso) ? null : valueOf(entries[iso], { inPeriod: false }),
    na: periodSet.has(iso),
    bleed: kind !== 'col' && !periodSet.has(iso) && ANY_BLEEDING.has(entries[iso]?.bleeding),
  }));
  const tc = temp.state === 'confirmee' ? temp.confirmDay : null;
  const sign = kind === 'col'
    ? evaluateCervix(seq, { tc, today, start: startLabel })
    : evaluateMucus(seq, { tc, today, start: startLabel });

  // --- Double contrôle (spec §2.4) ---
  const signWord = kind === 'col' ? 'col' : 'glaire';
  let double;
  if (temp.state === 'confirmee' && sign.state === 'confirme') {
    const jourFin = maxDate(temp.confirmDay, sign.criterionDay);
    const signDesc = kind === 'col'
      ? `dernier jour « col modifié » le ${lab(sign.peakDay)}, critère rempli le soir du ${lab(sign.criterionDay)}`
      : `sommet le ${lab(sign.peakDay)}, critère rempli le soir du ${lab(sign.criterionDay)}`;
    let text = `Double contrôle confirmé : température confirmée le ${lab(temp.confirmDay)} (${RULE_NAMES[temp.rule]}) et ${signWord} (${signDesc}). `
      + `Le critère le plus tardif est le ${lab(jourFin)} : infertile à partir de 18 h ce jour-là, jusqu'aux prochaines règles.`;
    if (seg.isCycle0) text += ' Au cycle 0, ce résultat est affiché à titre pédagogique : la protection reste nécessaire jusqu\'aux premières règles.';
    if (flags.emergencyContraception) text += ` Évaluation suspendue depuis la contraception d'urgence du ${fd(flags.emergencyContraception)} : fertile jusqu'aux prochaines règles.`;
    double = { state: 'confirme', infertileFrom: jourFin, explanation: text };
  } else {
    const tempPart = {
      confirmee: `température confirmée le ${temp.confirmDay ? lab(temp.confirmDay) : ''}`,
      en_attente: 'température en attente de valeurs',
      en_attente_valeurs_basses: 'pas encore assez de valeurs basses de température',
      aucune_montee: 'pas de montée de température confirmée',
      non_evaluable: 'température non évaluable',
    }[temp.state];
    const signPart = {
      confirme: `${signWord} : critère rempli le soir du ${sign.criterionDay ? lab(sign.criterionDay) : ''}`,
      en_attente: `${signWord} en attente`,
      bloque_donnee_manquante: `${signWord} bloqué${kind === 'col' ? '' : 'e'} (jour non noté le ${sign.missingDay ? fd(sign.missingDay) : ''})`,
      aucun_sommet: kind === 'col' ? 'pas de fin de phase fertile par le col' : 'pas de sommet de glaire',
    }[sign.state];
    double = { state: 'non_confirme', infertileFrom: null, explanation: `${endDot(`Double contrôle non atteint : ${tempPart} ; ${signPart}`)} Fertile jusqu'au double contrôle.` };
  }

  // Saignement de type règles après jourFin sans J1 confirmé (contrat K3) : probablement de nouvelles
  // règles ; les jours ne restent pas « infertiles jusqu'aux prochaines règles » tant que ce n'est pas tranché [PRUDENT].
  const swIso = double.state === 'confirme' ? double.infertileFrom : null;
  flags.unconfirmedBleed = swIso ? isos.find((iso) => iso >= swIso && PERIOD_BLEEDING.has(entries[iso]?.bleeding)) ?? null : null;

  // --- Début de cycle (spec §2.5) ---
  const pre = computeD({ segment: seg, previous, rules: data.rules, hasRemoval: R !== null });

  // --- Avertissements ---
  for (const iso of seg.ignoredJ1) warnings.push(`Début de cycle ignoré le ${fd(iso)} : un J1 demande un saignement de règles (léger, moyen ou abondant).`);
  const duplicateJ1 = seg.duplicateJ1 ?? [];
  for (const iso of duplicateJ1) warnings.push(`J1 en double le ${ddmm(iso)} : un seul 1er jour de règles est retenu, vérifie ta saisie.`);
  flags.duplicateJ1 = duplicateJ1;
  const segLength = segmentLength(seg);
  if (segLength !== null && segLength < SHORT_CYCLE_DAYS) {
    warnings.push(`Cycle de ${segLength} jour${segLength > 1 ? 's' : ''} seulement (J1 le ${ddmm(seg.start)} puis le ${ddmm(addDays(seg.end, 1))}) : confirmation de saisie demandée. Vérifie ces deux J1 ; par prudence, ce cycle ne compte pas parmi les cycles d'apprentissage ni pour le mode strict.`);
  }
  if (temp.fhm && temp.gapsInWindow > 1) warnings.push(`Plus d'une exclusion ou d'un jour sans température autour de la montée (${temp.gapsInWindow} jours) : vérifie tes données.`);
  if (temp.refusedExclusions.length) warnings.push(`Exclusion de température refusée (${temp.refusedExclusions.map(fd).join(', ')}) : une valeur retombée pendant la montée ne peut pas être retirée.`);
  if (temp.unmotivatedExclusions.length) warnings.push(`Exclusion de température sans motif ignorée (${temp.unmotivatedExclusions.map(fd).join(', ')}) : indique la perturbation pour exclure une valeur.`);
  if (temp.borderline) warnings.push('Montée de température en cas limite d\'arrondi : attendre 1 à 2 jours de plus est prudent.');
  if (temp.lhDoubt) warnings.push('Un test LH positif après la montée de température rend l\'évaluation douteuse ; attends de nouvelles valeurs.');
  if (sign.lowQualityPeak) warnings.push('Sommet de glaire de faible qualité (f) : une conseillère peut aider à interpréter.');
  if (flags.unevaluable) warnings.push(`Cycle non évaluable (${flags.unevaluableReason}) : considère-le comme fertile jusqu'aux prochaines règles.`);
  const anyBleeding = (iso) => ['spotting', 'leger', 'moyen', 'abondant'].includes(entries[iso]?.bleeding) && !periodSet.has(iso);
  const prevCycle = previous.length ? previous[previous.length - 1] : null;
  const intermediate = (seg.isCycle0 && isos.some(anyBleeding))
    || (flags.emergencyContraception && isos.some((iso) => iso >= flags.emergencyContraception && anyBleeding(iso)))
    || (temp.fhm && isos.some((iso) => iso > temp.fhm && diffDays(temp.fhm, iso) < 10 && anyBleeding(iso)))
    || (seg.startKnown && prevCycle?.temp.fhm && prevCycle.temp.state === 'confirmee' && diffDays(prevCycle.temp.fhm, seg.start) < 10);
  if (intermediate) warnings.push('Un saignement intermédiaire peut ressembler à des règles : ne confirme un J1 que pour de vraies règles, d\'abondance habituelle.');

  const length = segLength;
  const cycle = {
    index,
    postRemovalNumber: seg.postRemovalNumber,
    isCycle0: seg.isCycle0,
    start: seg.start,
    end: seg.end,
    length,
    dayCount: length ?? isos.length,
    periodDays: period,
    periodLength: period.length,
    flags,
    temp,
    sign,
    double,
    pre,
    highPhaseLength: seg.end !== null && temp.state === 'confirmee' ? diffDays(temp.fhm, seg.end) + 1 : null,
    ovulationEstimate: temp.state === 'confirmee' ? { from: addDays(temp.fhm, -2), to: temp.fhm } : null,
    anovulatoryLikely: (seg.end !== null && temp.state === 'aucune_montee')
      || (seg.end === null && !seg.isCycle0 && isos.length > 35 && temp.state !== 'confirmee'),
    warnings,
    // Hors contrat (utiles au moteur et à l'affichage) :
    startKnown: seg.startKnown,
    number: seg.number,
    duplicateJ1,
  };

  const { statuses, blockersByIso, lastInfertileDay } = buildStatuses(cycle, { seg, isos, periodSet, entries, kind, today, minutes, R });
  cycle.pre.lastInfertileDay = lastInfertileDay;
  return { cycle, statuses, blockersByIso };
}

/** Statuts de chaque jour du cycle jusqu'à aujourd'hui (spec §2.5.3, §2.6). */
function buildStatuses(cycle, { seg, isos, periodSet, entries, kind, today, minutes, R }) {
  const { temp, sign, flags, pre } = cycle;
  const fd = (iso) => formatDateFR(iso);
  const sw = cycle.double.state === 'confirme' ? cycle.double.infertileFrom : null;
  const preEnd = pre.D > 0 ? addDays(seg.start, pre.D - 1) : null;
  const preLabel = PRE_RULE_LABELS[pre.rule] ?? 'Règle de début de cycle';
  const confirmedFhm = temp.state === 'confirmee' ? temp.fhm : null;
  const lhFrom = temp.lhDoubt && temp.state !== 'confirmee' ? temp.lhDates[0] : null;
  const unconfirmedBleed = flags.unconfirmedBleed ?? null;
  const ref = new Set(temp.referenceDays);
  const excluded = new Set(temp.excludedDays);
  const ignored = new Set(temp.ignoredDays);
  const statuses = {};
  const blockersByIso = new Map();
  let preBroken = false;
  let lastInfertileDay = null;

  for (const iso of isos) {
    const e = entries[iso] ?? null;
    const inPeriod = periodSet.has(iso);
    const mucusQ = mucusValue(e, { inPeriod });
    const cervix = cervixValue(e, { inPeriod });
    const isToday = iso === today;
    const overlays = [];
    let state;
    let reason;

    // 1. Ce que disent les règles.
    if (sw && iso > sw) {
      state = STATES.INFERTILE_POST;
      reason = `Infertile depuis le soir du ${fd(sw)} (double contrôle), jusqu'aux prochaines règles`;
    } else if (sw && iso === sw) {
      if (isToday && minutes >= EVENING_MINUTES) {
        state = STATES.INFERTILE_POST;
        reason = 'Infertile depuis 18 h (double contrôle), jusqu\'aux prochaines règles';
      } else {
        state = STATES.FERTILE_JUSQU_A_18H;
        reason = 'Fertile jusqu\'à 18 h, puis infertile (double contrôle)';
      }
    } else if (preEnd && iso <= preEnd && !preBroken) {
      const check = preDayCheck(e, inPeriod, mucusQ, cervix, kind);
      if (check.ok) {
        state = STATES.INFERTILE_PRE;
        reason = `${preLabel} : infertile jusqu'au J${pre.D} inclus, sauf apparition de glaire`;
        lastInfertileDay = iso;
      } else if (isToday && check.pending) {
        state = STATES.INDETERMINE;
        reason = kind === 'col' ? 'À confirmer : observe ta glaire et ton col' : 'À confirmer : observe ta glaire';
        overlays.push('a_confirmer');
      } else {
        preBroken = true;
        state = STATES.FERTILE;
        reason = check.why;
      }
    } else if (temp.state === 'confirmee' && (sign.state === 'en_attente' || sign.state === 'bloque_donnee_manquante') && iso > temp.confirmDay) {
      state = STATES.INDETERMINE;
      reason = sign.state === 'bloque_donnee_manquante'
        ? `Double contrôle bloqué, ${kind === 'col' ? 'col non noté' : 'glaire non notée'} le ${fd(sign.missingDay)}`
        : `Température confirmée, ${kind === 'col' ? 'col' : 'glaire'} en attente de 3 jours de qualité inférieure`;
    } else if (sign.state === 'confirme' && (temp.state === 'en_attente' || temp.state === 'en_attente_valeurs_basses') && iso > sign.criterionDay) {
      state = STATES.INDETERMINE;
      reason = 'Critère glaire rempli, température en attente de valeurs';
      if (kind === 'col') reason = 'Critère col rempli, température en attente de valeurs';
    } else {
      state = STATES.FERTILE;
      if (preEnd === null && iso <= addDays(seg.start, 4) && seg.startKnown) {
        reason = `Pas de jour infertile en début de cycle (${lowerFirst(stripDot(pre.blockedReason ?? ''))})`;
      } else if (kind === 'glaire' && mucusQ !== null && mucusQ >= 2 && !inPeriod) {
        reason = `Phase fertile (glaire ${MUCUS_CODES[mucusQ]})`;
      } else if (seg.end !== null && temp.state === 'aucune_montee') {
        reason = 'Pas de montée de température confirmée dans ce cycle, fertile jusqu\'aux règles';
      } else {
        reason = `Fertile jusqu'au double contrôle (température + ${kind === 'col' ? 'col' : 'glaire'})`;
      }
    }
    const rulesState = state;

    // 2. Suspensions : cycle 0, contraception d'urgence, cycle non évaluable → INDETERMINE.
    let overridden = false;
    if (seg.isCycle0) {
      overlays.push('cycle0');
      state = STATES.INDETERMINE;
      reason = R === null ? 'Début de cycle inconnu : fertile jusqu\'aux prochaines règles'
        : iso < R ? 'Avant le retrait du stérilet' : 'Cycle 0 : protection jusqu\'aux premières règles';
      overridden = true;
    }
    if (flags.emergencyContraception && iso >= flags.emergencyContraception) {
      overlays.push('cu');
      if (!overridden) {
        state = STATES.INDETERMINE;
        reason = `Contraception d'urgence le ${fd(flags.emergencyContraception)} : fertile jusqu'aux prochaines règles`;
        overridden = true;
      }
    }
    if (flags.unevaluable && iso >= flags.unevaluableFrom) {
      overlays.push('non_evaluable');
      if (!overridden) {
        state = STATES.INDETERMINE;
        reason = `Cycle non évaluable : ${flags.unevaluableReason}`;
        overridden = true;
      }
    }
    if (unconfirmedBleed && iso >= unconfirmedBleed) {
      overlays.push('a_confirmer');
      if (!overridden) {
        state = STATES.INDETERMINE;
        reason = `Saignement de type règles le ${fd(unconfirmedBleed)} sans J1 confirmé, à confirmer`;
        overridden = true;
      }
    }

    // 3. Surcouches.
    const bleeding = e?.bleeding;
    if (inPeriod || PERIOD_BLEEDING.has(bleeding)) overlays.push('regles');
    if (bleeding === 'spotting') overlays.push('spotting');
    if (bleeding === 'post_retrait') overlays.push('post_retrait');
    if (flags.learning) overlays.push('apprentissage');
    if (flags.strictFSRH) overlays.push('strict');
    if (temp.borderline && temp.confirmDay && iso >= temp.confirmDay) overlays.push('cas_limite');
    if (lhFrom && iso >= lhFrom) overlays.push('douteux_lh');

    // 4. Décision (spec §2.6).
    const blockers = [];
    if (seg.preRemoval) blockers.push('Période sous stérilet (historique).');
    if (lhFrom && iso >= lhFrom) blockers.push('Évaluation douteuse : un test LH positif après la montée de température ; attends de nouvelles valeurs.');
    if (flags.learning) blockers.push('Protection recommandée (cycle d\'apprentissage) : les cycles 0 à 3 après le retrait servent à apprendre, même les jours que les règles donnent infertiles.');
    if (flags.strictFSRH) blockers.push('Mode strict FSRH : protection tous les jours jusqu\'à ce que 3 cycles après le retrait soient passés et que tes cycles soient classés réguliers (au moins 6 cycles complets valides).');
    blockersByIso.set(iso, blockers);
    const infertile = state === STATES.INFERTILE_POST || state === STATES.INFERTILE_PRE;
    const protectionNeeded = !infertile || blockers.length > 0;

    let decisionReason;
    if (seg.preRemoval) {
      decisionReason = 'Période sous stérilet (historique)';
    } else if (overridden) {
      decisionReason = `Protection nécessaire. ${endDot(reason)}`;
      if (seg.isCycle0 && R !== null && iso < R) decisionReason = R > today
        ? 'Protection nécessaire : stérilet bientôt retiré, les spermatozoïdes peuvent survivre jusqu\'à 7 jours.'
        : 'Période sous stérilet (historique)';
      else if (seg.isCycle0 && R !== null) decisionReason = 'Protection nécessaire : au cycle 0 (du retrait aux premières règles), aucun jour n\'est levé.';
      if (seg.isCycle0 && (rulesState === STATES.INFERTILE_POST || rulesState === STATES.FERTILE_JUSQU_A_18H) && !(R !== null && iso < R)) {
        decisionReason += ' Le double contrôle est atteint, mais il est affiché à titre pédagogique seulement.';
      }
    } else if (state === STATES.FERTILE_JUSQU_A_18H) {
      if (blockers.length) {
        decisionReason = isToday
          ? 'Double contrôle atteint aujourd\'hui : selon les règles, infertile à partir de 18 h ce soir. Protection nécessaire toute la journée, y compris après 18 h.'
          : 'Ce jour-là, double contrôle atteint : selon les règles, infertile à partir de 18 h. Protection nécessaire toute la journée, y compris après 18 h.';
        decisionReason += ` ${blockers.join(' ')}`;
      } else {
        decisionReason = isToday
          ? 'Protection nécessaire jusqu\'à 18 h : le double contrôle est atteint aujourd\'hui, les règles indiquent l\'infertilité à partir de ce soir 18 h.'
          : 'Ce jour-là, protection nécessaire jusqu\'à 18 h, puis infertile selon le double contrôle.';
      }
    } else if (!infertile) {
      decisionReason = `Protection nécessaire. ${endDot(reason)}`;
    } else if (blockers.length) {
      decisionReason = blockers.join(' ');
    } else if (state === STATES.INFERTILE_POST) {
      decisionReason = `Pas de protection nécessaire selon les règles : double contrôle confirmé (température confirmée le ${fd(temp.confirmDay)}, ${RULE_NAMES[temp.rule]} ; `
        + `critère ${kind === 'col' ? 'du col' : 'glaire'} rempli le soir du ${fd(sign.criterionDay)}), infertile depuis le soir du ${fd(sw)} jusqu'aux prochaines règles. Vérifie la plausibilité.`;
    } else {
      decisionReason = `Pas de protection nécessaire selon les règles : ${lowerFirst(preLabel)} (jusqu'au J${pre.D} inclus) et ${inPeriod ? 'jour de règles' : 'pas de glaire observée'}. Dès la moindre glaire, tu redeviens fertile.`;
    }

    // 5. Phase indicative.
    let phase;
    if (inPeriod) phase = 'regles';
    else if (confirmedFhm && iso > confirmedFhm) phase = 'luteale';
    else if (confirmedFhm && iso >= addDays(confirmedFhm, -2)) phase = 'ovulatoire';
    else if (!seg.startKnown || (flags.unevaluable && iso >= flags.unevaluableFrom)) phase = 'inconnue';
    else phase = 'folliculaire';

    // 6. Marqueurs du graphique.
    const highIdx = temp.highDays.indexOf(iso);
    const offset = sign.peakDay ? diffDays(sign.peakDay, iso) : null;
    const signMissing = !inPeriod && (kind === 'col' ? cervix === null : mucusQ === null);
    // Bascule du soir (contrat K1) : sur l'état FINAL, indépendante de l'heure de l'analyse.
    const eveningSwitch = sw && iso === sw && (state === STATES.FERTILE_JUSQU_A_18H || state === STATES.INFERTILE_POST)
      ? { at: EVENING_TIME, blocked: blockers.length > 0 }
      : null;

    statuses[iso] = {
      iso,
      cycleIndex: cycle.index,
      cycleDay: cycleDay(seg.start, iso),
      phase,
      state,
      stateReason: reason,
      overlays,
      protectionNeeded,
      decisionReason,
      eveningSwitch,
      markers: {
        reference: ref.has(iso),
        high: highIdx >= 0 ? highIdx + 1 : null,
        ignored: ignored.has(iso),
        excluded: excluded.has(iso),
        peak: sign.peakDay === iso,
        peakPlus: offset !== null && offset >= 1 && offset <= 3 ? offset : null,
        fhm: temp.fhm === iso,
        confirm: temp.confirmDay === iso,
        missingTemp: !(e && isValidTemp(e.temp)),
        missingSign: signMissing,
      },
    };
  }
  return { statuses, blockersByIso, lastInfertileDay };
}

/** Décision et conseils pour aujourd'hui (contrat §5.2 CurrentState). */
function buildCurrent(cycle, status, blockers, ctx) {
  const { data, today, minutes } = ctx;
  const R = data.profile.iudRemovalDate;
  const e = data.days[today] ?? null;
  const kind = cycle.sign.kind;
  const inPeriod = cycle.periodDays.includes(today);
  const cd = status.cycleDay;
  const fd = (iso) => formatDateFR(iso);
  const long = (iso) => formatDateFR(iso, 'long');
  const { temp, sign, flags, pre } = cycle;

  let headline = HEADLINES.protection;
  if (!status.protectionNeeded) headline = HEADLINES.libre;
  else if (status.state === STATES.FERTILE_JUSQU_A_18H && blockers.length === 0) headline = HEADLINES.soir;

  const signObserved = (kind === 'col' ? cervixValue(e, { inPeriod }) : mucusValue(e, { inPeriod })) !== null;
  const yesterday = data.days[addDays(today, -1)];
  const todo = {
    temp: !(e && (isValidTemp(e.temp) || e.tempExcluded === true)),
    sign: !inPeriod && !signObserved,
    bleeding: !e?.bleeding && (cycle.periodDays.includes(addDays(today, -1)) || PERIOD_BLEEDING.has(yesterday?.bleeding)),
  };

  const cuActive = flags.emergencyContraception && today >= flags.emergencyContraception;
  const unevaluableNow = flags.unevaluable && today >= flags.unevaluableFrom;
  const postConfirmed = status.state === STATES.INFERTILE_POST || status.state === STATES.FERTILE_JUSQU_A_18H;
  const preLabel = PRE_RULE_LABELS[pre.rule] ?? 'règle de début de cycle';
  const confirmMucus = status.overlays.includes('a_confirmer') && cd <= pre.D;
  const confirmJ1 = status.overlays.includes('a_confirmer') && !confirmMucus;

  // Détail (1 à 3 phrases).
  const sentences = [];
  if (cycle.isCycle0) {
    if (R !== null && R > today) sentences.push(`Retrait du stérilet prévu le ${long(R)}. Protège-toi dès maintenant : les spermatozoïdes peuvent survivre jusqu'à 7 jours, et la fertilité revient dès le retrait.`);
    else if (R !== null) sentences.push(`Cycle 0, jour ${cd} : entre le retrait du stérilet et tes premières règles, chaque jour est considéré comme fertile. Tes observations servent déjà à repérer une montée de température.`);
    else sentences.push('Ton dernier début de règles n\'est pas noté : chaque jour est considéré comme fertile jusqu\'à tes prochaines règles, à confirmer comme J1.');
  } else if (cuActive) {
    sentences.push(`Contraception d'urgence prise le ${long(flags.emergencyContraception)} : l'ovulation a pu être seulement retardée. Protège-toi à chaque rapport jusqu'à tes prochaines vraies règles.`);
  } else if (unevaluableNow) {
    sentences.push(`Ce cycle n'est pas évaluable (${flags.unevaluableReason}) : considère-le comme fertile jusqu'à tes prochaines règles.`);
  } else if (status.state === STATES.INFERTILE_POST) {
    sentences.push(`J${cd} : double contrôle confirmé. Selon la méthode, infertile depuis le soir du ${long(cycle.double.infertileFrom)} jusqu'à tes prochaines règles.`);
  } else if (status.state === STATES.FERTILE_JUSQU_A_18H) {
    sentences.push(blockers.length
      ? `J${cd} : le double contrôle est atteint aujourd'hui ; selon la méthode, infertile à partir de 18 h. Protection nécessaire toute la journée, y compris après 18 h.`
      : `J${cd} : le double contrôle est atteint aujourd'hui. Protection nécessaire jusqu'à 18 h, puis, selon la méthode, infertile jusqu'à tes prochaines règles.`);
  } else if (status.state === STATES.INFERTILE_PRE) {
    sentences.push(`J${cd} : ${lowerFirst(preLabel)}, infertile jusqu'au J${pre.D} inclus tant que tu n'observes pas de glaire.`);
  } else if (confirmJ1) {
    sentences.push(`J${cd} : ${lowerFirst(status.stateReason)}. Tant que ce n'est pas tranché, considère-toi comme fertile.`);
  } else if (confirmMucus) {
    sentences.push(`J${cd} : observe ta glaire aujourd'hui. Si tu ne sens et ne vois rien (sec ou rien), la journée sera infertile selon la ${lowerFirst(preLabel)} ; sinon, tu es fertile.`);
  } else {
    sentences.push(`J${cd} : ${endDot(lowerFirst(status.stateReason))}`);
    if (temp.state === 'en_attente' && temp.expected) sentences.push(`Température : il faut ${temp.expected}.`);
    else if (temp.state === 'confirmee' && sign.state !== 'confirme') sentences.push(`Température confirmée le ${fd(temp.confirmDay)} ; il manque le critère ${kind === 'col' ? 'du col' : 'de la glaire'}.`);
  }
  if (flags.learning && !cycle.isCycle0) sentences.push('Cycle d\'apprentissage : la protection reste recommandée, même les jours que les règles donnent infertiles.');
  else if (flags.strictFSRH && !cycle.isCycle0) sentences.push('Mode strict FSRH actif : protection tous les jours.');
  else if (status.overlays.includes('douteux_lh')) sentences.push('Un test LH positif après la montée de température rend l\'évaluation douteuse ; attends de nouvelles valeurs.');

  // Prochaines étapes concrètes.
  const steps = [];
  if (cycle.isCycle0) steps.push('Dès que tes vraies règles arrivent, note-les et confirme le J1.');
  if (cuActive) steps.push('Utilise un préservatif à chaque rapport jusqu\'à tes prochaines vraies règles.');
  if (headline === HEADLINES.soir) steps.push('À partir de 18 h ce soir, les règles indiquent l\'infertilité jusqu\'à tes prochaines règles.');
  if (confirmJ1) steps.push('Si ce saignement correspond à tes règles, d\'abondance habituelle, confirme le J1 dans ta saisie.');
  if (confirmMucus) {
    steps.push(kind === 'col' ? 'Observe ta glaire et ton col aujourd\'hui, puis note-les.' : 'Observe ta glaire aujourd\'hui (sensation et aspect), puis note-la.');
  } else if (todo.sign && !postConfirmed) {
    steps.push(kind === 'col' ? 'Observe ton col aujourd\'hui (ouverture et fermeté) et note-le.' : 'Observe ta glaire aujourd\'hui et note la meilleure qualité de la journée.');
  }
  if (todo.temp && minutes < 12 * 60) steps.push('Note ta température de ce matin si tu l\'as prise au réveil, avant de te lever.');
  if (!postConfirmed) steps.push('Mesure ta température demain au réveil, avant de te lever, avec le même thermomètre et la même voie.');
  if (sign.state === 'bloque_donnee_manquante' && sign.missingDay) {
    steps.push(`Il manque ${kind === 'col' ? 'le col' : 'la glaire'} du ${long(sign.missingDay)} : complète seulement si tu te souviens de ce que tu as réellement observé.`);
  } else if (sign.state === 'en_attente' && sign.peakDay && !postConfirmed) {
    steps.push(`Continue à observer chaque jour : il faut 3 jours de qualité inférieure après le ${kind === 'col' ? 'dernier jour « col modifié »' : 'sommet'} (${fd(sign.peakDay)}).`);
  }
  if (postConfirmed) steps.push('Tu peux continuer à mesurer ta température : elle aide à prévoir tes règles.');
  if (todo.bleeding) steps.push('Note ton saignement d\'aujourd\'hui pour suivre la durée de tes règles.');

  return {
    cycleIndex: cycle.index,
    cycleDay: cd,
    isCycle0: cycle.isCycle0,
    postRemovalNumber: cycle.postRemovalNumber,
    status,
    headline,
    detail: sentences.slice(0, 3).join(' '),
    nextSteps: steps.slice(0, 5),
    todo,
  };
}

/**
 * Analyse des cycles : découpage, évaluation de chaque cycle et statut de chaque jour
 * jusqu'à aujourd'hui, décision du jour. Pur et déterministe (n'utilise que `now`).
 * Les prédictions, statistiques et alertes sont ajoutées par index.js.
 * @param {object} rawData AppData
 * @param {{ today: string, time?: string }} now heure locale de l'appareil ; heure absente ou invalide → avant 18 h
 * @returns {{ cycles: object[], days: object, current: object|null }}
 */
export function analyzeCycles(rawData, now) {
  if (!now || !isValidISO(now.today)) throw new RangeError('Date du jour invalide');
  const data = normalizeEngineData(rawData);
  const today = now.today;
  const ctx = { data, today, minutes: parseTime(now.time) ?? 0 };
  const segments = buildSegments(data, today);
  const cycles = [];
  const days = {};
  let lastBlockers = new Map();
  segments.forEach((seg, index) => {
    const { cycle, statuses, blockersByIso } = evaluateCycle(seg, index, ctx, cycles);
    cycles.push(cycle);
    Object.assign(days, statuses);
    lastBlockers = blockersByIso;
  });
  let current = null;
  if (cycles.length && days[today]) {
    current = buildCurrent(cycles[cycles.length - 1], days[today], lastBlockers.get(today) ?? [], ctx);
  }
  return { cycles, days, current };
}
