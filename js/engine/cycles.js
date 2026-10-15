// Découpage en cycles (spec §2.1, §3.1) et drapeaux de cycle (spec §2.2.1, §2.2.3.9, §2.5.4-2.5.6).
//
// Un cycle ne commence QUE sur un jour `cycleStart: true` avec un saignement de règles
// (léger, moyen ou abondant) : jamais sur un spotting ni sur un saignement post-retrait.
//
// Segments et numérotation (R = profile.iudRemovalDate) :
// - jours avant le 1er J1 → segment à J1 inconnu (isCycle0) ;
// - R défini : le segment qui contient R est le cycle 0 (même si son J1 est connu) ; les segments
//   entièrement avant R sont « avant retrait » (preRemoval) ; les cycles qui commencent après R
//   sont numérotés 1, 2, 3… ;
// - R absent : postRemovalNumber = null partout ; un segment à J1 inconnu reste entièrement protégé.
//
// J1 en double : un J1 confirmé qui tombe dans la période de règles du J1 retenu juste avant
// (ou dont la veille ou l'avant-veille en fait partie) est écarté ; le J1 le plus ancien est gardé.

import { addDays, diffDays, formatDateFR, isValidISO } from './dates.js';
import { regularityOf } from './regularity.js';

/** Intensités de saignement qui peuvent ouvrir un cycle (avec confirmation). */
export const PERIOD_BLEEDING = new Set(['leger', 'moyen', 'abondant']);

const ROUTE_LABELS = { buccale: 'buccale', vaginale: 'vaginale', rectale: 'rectale' };

/** Durée en dessous de laquelle un cycle terminé demande une confirmation de saisie (spec §2.6.B) [PRUDENT]. */
export const SHORT_CYCLE_DAYS = 15;

/**
 * Vrai si le jour est un J1 confirmé (cycleStart + saignement de règles).
 * @param {object|null|undefined} entry DayEntry
 * @returns {boolean}
 */
export function isJ1Entry(entry) {
  return !!entry && entry.cycleStart === true && PERIOD_BLEEDING.has(entry.bleeding);
}

/**
 * Segments chronologiques des jours suivis, jusqu'à aujourd'hui inclus.
 * Chaque segment : { start, end (veille du J1 suivant, ou null si en cours), startKnown, isCycle0,
 * postRemovalNumber, preRemoval, number (numéro effectif : post-retrait, ou ordre de suivi si R absent ;
 * null avant le retrait), ignoredJ1 (jours cycleStart sans saignement de règles), duplicateJ1 (J1
 * confirmés écartés car dans la période de règles du J1 retenu juste avant) }.
 * @param {{ profile?: object, days?: object }} data AppData (déjà nettoyée)
 * @param {string} today 'YYYY-MM-DD'
 * @returns {object[]}
 */
export function buildSegments(data, today) {
  const entries = data?.days ?? {};
  const isos = Object.keys(entries).filter((iso) => isValidISO(iso) && iso <= today).sort();
  const R = isValidISO(data?.profile?.iudRemovalDate) ? data.profile.iudRemovalDate : null;
  const confirmedJ1 = isos.filter((iso) => isJ1Entry(entries[iso]));
  const ignoredJ1 = isos.filter((iso) => entries[iso]?.cycleStart === true && !isJ1Entry(entries[iso]));
  // J1 en double (spec §2.1) : on garde toujours le plus ancien ; un J1 qui appartient à la période
  // de règles du J1 retenu juste avant, ou dont J-1 ou J-2 en fait partie, est écarté.
  const j1s = [];
  const duplicateJ1 = [];
  let period = null;
  for (const j of confirmedJ1) {
    if (period && (period.has(j) || period.has(addDays(j, -1)) || period.has(addDays(j, -2)))) {
      duplicateJ1.push(j);
      continue;
    }
    j1s.push(j);
    period = new Set(periodDays(entries, j, null, today));
  }

  let first = isos.length ? isos[0] : null;
  if (R && R <= today && (first === null || R < first)) first = R;
  if (first === null) return [];

  const segs = [];
  if (!j1s.length || first < j1s[0]) segs.push({ start: first, startKnown: false });
  for (const j of j1s) segs.push({ start: j, startKnown: true });
  segs.forEach((s, k) => {
    s.end = k + 1 < segs.length ? addDays(segs[k + 1].start, -1) : null;
    s.ignoredJ1 = ignoredJ1.filter((iso) => iso >= s.start && (s.end === null || iso <= s.end));
    s.duplicateJ1 = duplicateJ1.filter((iso) => iso >= s.start && (s.end === null || iso <= s.end));
  });

  let n = 0;
  for (const s of segs) {
    if (R) {
      if (s.end !== null && s.end < R) {
        Object.assign(s, { preRemoval: true, isCycle0: !s.startKnown, postRemovalNumber: null, number: null });
      } else if (s.start <= R) {
        Object.assign(s, { preRemoval: false, isCycle0: true, postRemovalNumber: 0, number: 0 });
      } else {
        n += 1;
        Object.assign(s, { preRemoval: false, isCycle0: false, postRemovalNumber: n, number: n });
      }
    } else if (!s.startKnown) {
      Object.assign(s, { preRemoval: false, isCycle0: true, postRemovalNumber: null, number: 0 });
    } else {
      n += 1;
      Object.assign(s, { preRemoval: false, isCycle0: false, postRemovalNumber: null, number: n });
    }
  }
  return segs;
}

/**
 * Jours de la période de règles : J1 puis les jours suivants marqués règles
 * (léger, moyen, abondant), avec au plus 1 jour sans saignement de règles au milieu [CHOIX].
 * Le jour de pause, encadré par des jours de règles, fait partie de la période.
 * @param {object} entries data.days
 * @param {string} start J1
 * @param {string|null} end fin du cycle (ou null)
 * @param {string} today
 * @returns {string[]}
 */
export function periodDays(entries, start, end, today) {
  if (!isJ1Entry(entries[start])) return [];
  const limit = end !== null && end < today ? end : today;
  const out = [start];
  let gapUsed = false;
  let iso = addDays(start, 1);
  while (iso <= limit) {
    if (PERIOD_BLEEDING.has(entries[iso]?.bleeding)) {
      out.push(iso);
    } else {
      const next = addDays(iso, 1);
      if (gapUsed || next > limit || !PERIOD_BLEEDING.has(entries[next]?.bleeding)) break;
      gapUsed = true;
      out.push(iso);
    }
    iso = addDays(iso, 1);
  }
  return out;
}

/**
 * Non-évaluabilité d'un cycle (spec §2.2.1, §2.2.3.9, §2.6) :
 * - cycle déclaré non évaluable (un jour avec cycleUnevaluable) → tout le cycle ;
 * - changement de voie de mesure entre deux mesures du cycle → à partir du jour du changement.
 *   Une mesure sans voie a une voie INCONNUE (jamais la voie actuelle du profil) : passer d'une
 *   mesure sans voie à une mesure avec voie, ou l'inverse, compte comme un changement [PRUDENT] ;
 *   un cycle dont toutes les mesures sont sans voie reste évaluable ;
 * - changement de thermomètre (thermometerChanged) sur un jour qui suit au moins une mesure du
 *   cycle → à partir de ce jour (un changement au J1 ou avant toute mesure du cycle est sans effet).
 * @param {object} entries
 * @param {string[]} isos jours du cycle (≤ aujourd'hui)
 * @returns {{ unevaluable: boolean, from: string|null, reason: string|null, declaredOn: string|null,
 *   routeChangeOn: string|null, deviceChangeOn: string|null, cutOn: string|null }}
 *   cutOn : premier jour à partir duquel les températures ne sont plus comparables (voie ou thermomètre).
 */
export function detectUnevaluable(entries, isos) {
  const declaredOn = isos.find((iso) => entries[iso]?.cycleUnevaluable === true) ?? null;
  const routeName = (r) => (r === null ? 'voie non renseignée' : ROUTE_LABELS[r]);
  let routeChangeOn = null;
  let routeText = null;
  let deviceChangeOn = null;
  let measured = false;
  let prev; // undefined : aucune mesure encore ; null : voie inconnue
  for (const iso of isos) {
    const e = entries[iso];
    if (!e) continue;
    if (deviceChangeOn === null && measured && e.thermometerChanged === true) deviceChangeOn = iso;
    if (!Number.isInteger(e.temp)) continue;
    measured = true;
    const route = ROUTE_LABELS[e.tempRoute] ? e.tempRoute : null;
    if (routeChangeOn === null && prev !== undefined && route !== prev) {
      routeChangeOn = iso;
      routeText = `${routeName(prev)} → ${routeName(route)}`;
    }
    prev = route;
  }
  const cutOn = [routeChangeOn, deviceChangeOn].filter(Boolean).sort()[0] ?? null;
  if (!declaredOn && !cutOn) {
    return { unevaluable: false, from: null, reason: null, declaredOn: null, routeChangeOn: null, deviceChangeOn: null, cutOn: null };
  }
  const reasons = [];
  if (declaredOn) reasons.push(`cycle déclaré non évaluable le ${formatDateFR(declaredOn)}`);
  if (routeChangeOn) reasons.push(`changement de voie de mesure (${routeText}) le ${formatDateFR(routeChangeOn)}`);
  if (deviceChangeOn) reasons.push(`changement de thermomètre le ${formatDateFR(deviceChangeOn)}`);
  return {
    unevaluable: true,
    from: declaredOn ? isos[0] : cutOn,
    reason: reasons.join(' ; '),
    declaredOn,
    routeChangeOn,
    deviceChangeOn,
    cutOn,
  };
}

/**
 * Drapeaux d'un cycle (contrat §5.2 Cycle.flags, + preRemoval).
 * @param {object} seg segment (buildSegments)
 * @param {{ data: object, today: string, isos: string[], previous: object[] }} ctx
 *   previous : cycles déjà évalués (Cycle[] complets, avec temp et `number`) qui précèdent ce segment
 * @returns {{ flags: object, unevaluable: object }}
 */
export function computeFlags(seg, { data, today, isos, previous }) {
  const entries = data.days;
  const rules = data.rules;
  const profile = data.profile;
  // Un cycle terminé de moins de 15 jours (saisie à confirmer) ne fait pas avancer le compte des
  // cycles d'apprentissage ni du mode strict [PRUDENT, spec §2.6.B].
  const shortBefore = previous.filter((c) => c.number !== null && c.number >= 1 && c.length !== null && c.length < SHORT_CYCLE_DAYS).length;
  const num = seg.number === null ? null : seg.number - shortBefore; // numéro effectif

  // Apprentissage : cycles 0 à 3 post-retrait (sans retrait renseigné : segment à J1 inconnu et 3 premiers cycles suivis).
  const learning = rules.learningMode !== 'off' && num !== null && num <= 3;

  // Mode strict FSRH (spec §2.5.4, §2.9) : tant que 3 cycles post-retrait ne sont pas passés OU que
  // les cycles ne sont pas classés réguliers (FIGO, au moins 6 cycles valides, âge 18-45 ans).
  const strictFSRH = rules.strictFSRH === true
    && ((num === null || num <= 3) || regularityOf(previous, data, today).status !== 'reguliers');

  // Valeur post-hormonale (extra) : DIU hormonal ou inconnu (y compris retrait daté sans type, spec §3.2),
  // ou cuivre + option manuelle ; active au cycle 0 et jusqu'au 1er cycle ≥ 1 avec FHM confirmée (ce cycle compris).
  const unknownType = profile.iudType === 'inconnu' || (profile.iudType === null && isValidISO(profile.iudRemovalDate));
  const eligible = profile.iudType === 'hormonal' || unknownType
    || (profile.iudType === 'cuivre' && rules.postHormonalCopper === true);
  let postHormonal = false;
  if (eligible) {
    if (seg.number === null || seg.number === 0) postHormonal = true;
    else postHormonal = !previous.some((c) => c.number !== null && c.number >= 1 && c.temp.state === 'confirmee'
      && !c.flags.emergencyContraception && !c.flags.unevaluable);
  }

  const emergencyContraception = isos.find((iso) => !!entries[iso]?.emergencyContraception) ?? null;
  const unevaluable = detectUnevaluable(entries, isos);
  const atypical = isos.some((iso) => Array.isArray(entries[iso]?.events) && entries[iso].events.length > 0);

  return {
    flags: {
      learning,
      strictFSRH,
      postHormonal,
      emergencyContraception,
      unevaluable: unevaluable.unevaluable,
      unevaluableFrom: unevaluable.from,
      unevaluableReason: unevaluable.reason,
      atypical,
      preRemoval: !!seg.preRemoval,
    },
    unevaluable,
  };
}

/**
 * Durée d'un cycle terminé (J1 suivant − J1) ; null si en cours, à J1 inconnu ou cycle 0 (contrat §5.2).
 * @param {object} seg
 * @returns {number|null}
 */
export function segmentLength(seg) {
  return seg.end !== null && seg.startKnown && !seg.isCycle0 ? diffDays(seg.start, seg.end) + 1 : null;
}
