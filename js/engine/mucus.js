// Glaire cervicale (spec §2.3.1-2.3.2) et col de l'utérus (spec §2.3.3).
//
// Valeur q du jour : 0 = t, 1 = ∅, 2 = f, 3 = S, 4 = S+ ; null = non observé / douteux.
// Le sommet (P) se cherche en jours CALENDAIRES : P+1, P+2, P+3 doivent être observés,
// de qualité inférieure, sans retour de la qualité de P jusqu'à F = max(P+3, Tc).
//
// Saignement hors règles (glaire seulement) [PRUDENT, écart à faire valider, §9] : il vaut S+ (4)
// pour invalider un sommet, mais il ne relève pas la « meilleure qualité » des jours suivants
// et, comme candidat sommet, il tombe dès qu'une glaire f, S ou S+ est observée de P+1 à F.
// Le sommet ne peut donc que reculer, et la phase fertile que s'allonger.

import { addDays, cycleDay, endDot, formatDateFR, maxDate } from './dates.js';

/** Codes Sensiplan par valeur q. */
export const MUCUS_CODES = Object.freeze(['t', '∅', 'f', 'S', 'S+']);

const SENSATION_Q = { sec: 0, rien: 1, humide: 2, mouille: 4 };
const ASPECT_Q = { epaisse: 3, filante: 4 }; // « rien vu » : aucune contribution
/** Saignements qui, hors période de règles, valent S+ (glaire) ou « col modifié ». */
export const ANY_BLEEDING = new Set(['spotting', 'leger', 'moyen', 'abondant', 'post_retrait']);

const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Valeur de glaire q d'un jour (spec §2.3.1).
 * - saignement hors période de règles (spotting, saignement non confirmé, post-retrait) → 4 (S+) ;
 * - observation douteuse → null ;
 * - sinon maximum des champs renseignés (une saisie partielle compte) ; aspect « rien vu » seul → null.
 * Pendant les règles, seuls les champs de glaire comptent (le sang n'est pas de la glaire).
 * @param {object|null|undefined} day DayEntry
 * @param {{ inPeriod?: boolean }} [opts]
 * @returns {number|null}
 */
export function mucusValue(day, { inPeriod = false } = {}) {
  if (!day || typeof day !== 'object') return null;
  if (!inPeriod && ANY_BLEEDING.has(day.bleeding)) return 4;
  if (day.mucusDoubtful === true) return null;
  let q = null;
  if (own(SENSATION_Q, day.mucusSensation)) q = SENSATION_Q[day.mucusSensation];
  if (own(ASPECT_Q, day.mucusAspect)) q = Math.max(q ?? 0, ASPECT_Q[day.mucusAspect]);
  return q;
}

/**
 * État du col d'un jour (spec §2.3.3), sur la même échelle « basse / haute » que la glaire :
 * 0 = fermé ET dur ; 1 = modifié (mi-ouvert, ouvert ou mou) ; null = non observé ou incomplet.
 * Un saignement hors règles compte comme un état fertile (1) [PRUDENT].
 * @param {object|null|undefined} day DayEntry
 * @param {{ inPeriod?: boolean }} [opts]
 * @returns {0|1|null}
 */
export function cervixValue(day, { inPeriod = false } = {}) {
  if (!day || typeof day !== 'object') return null;
  if (!inPeriod && ANY_BLEEDING.has(day.bleeding)) return 1;
  if (day.cervixOpening === 'mi_ouvert' || day.cervixOpening === 'ouvert' || day.cervixFirmness === 'mou') return 1;
  if (day.cervixOpening === 'ferme' && day.cervixFirmness === 'dur') return 0;
  return null;
}

/**
 * Recherche générique du sommet (glaire) ou du dernier jour « col modifié ».
 * seq : jours calendaires consécutifs du cycle, du J1 au dernier jour connu (≤ aujourd'hui),
 * { iso, q, na, bleed } — na = jour de règles : ni candidat, ni bloquant (observation non exigée) ;
 * bleed = saignement hors règles (q = 4) : il ne relève pas la meilleure qualité et ne compte pas
 * dans la « meilleure qualité du cycle » (pas de sommet sur un cycle sans glaire f, S ou S+).
 *
 * Ordre des tests pour chaque candidate P (meilleure qualité observée jusque-là, q ≥ minQ) :
 * 1. un jour observé de P+1 à F avec q ≥ q(P) invalide P → candidate suivante
 *    (F = max(P+3, Tc) ; tant que Tc est inconnu, F s'étend au moins jusqu'au dernier jour connu) ;
 *    si P est un saignement, tout jour observé de P+1 à F avec q ≥ minQ l'invalide ;
 * 2. un jour passé non observé de P+1 à max(P+3, Tc) → BLOQUÉ ;
 * 3. P+3 pas encore atteint (ou observation du jour manquante) → EN_ATTENTE ;
 * 4. sinon CONFIRMÉ, critère rempli le soir de P+3.
 * Le test 1 passe avant les tests 2-3 : un retour observé de la meilleure qualité prouve que P
 * n'est pas le sommet, quel que soit le jour manquant ; le sommet retenu ensuite est plus tardif,
 * donc le critère ne peut qu'être retardé (voir rapport : écart d'ordre assumé avec le pseudo-code).
 */
function findPeak(seq, { tc = null, today, minQ }) {
  const days = seq.filter((d) => !d.na);
  const lastIso = seq.length ? seq[seq.length - 1].iso : null;
  // Meilleure qualité du cycle : les saignements hors règles n'en font pas partie [PRUDENT].
  const observed = days.filter((d) => d.q !== null && !d.bleed);
  const best = observed.length ? Math.max(...observed.map((d) => d.q)) : null;
  const invalidated = [];
  if (best === null || best < minQ) return { state: 'aucun_sommet', best, invalidated };

  let maxPrev = -1;
  for (let k = 0; k < days.length; k++) {
    const P = days[k];
    const isCandidate = P.q !== null && P.q >= minQ && P.q >= maxPrev;
    if (!P.bleed && P.q !== null && P.q > maxPrev) maxPrev = P.q;
    if (!isCandidate) continue;

    const p3 = addDays(P.iso, 3);
    const fEnd = tc ? maxDate(p3, tc) : maxDate(p3, lastIso);
    const nullEnd = tc ? maxDate(p3, tc) : p3;
    const after = days.slice(k + 1);
    const threshold = P.bleed ? minQ : P.q;
    const back = after.find((d) => d.iso <= fEnd && d.q !== null && d.q >= threshold);
    if (back) {
      // « Retour » seulement si un jour de qualité inférieure a été observé entre les deux (sinon : simple montée de la glaire).
      const isReturn = after.some((d) => d.iso < back.iso && d.q !== null && d.q < threshold);
      invalidated.push({ peak: P.iso, by: back.iso, isReturn, bleed: !!P.bleed });
      continue;
    }
    const plus = [1, 2, 3].map((n) => {
      const iso = addDays(P.iso, n);
      const d = seq.find((x) => x.iso === iso);
      return { iso, q: d ? d.q : undefined, na: d ? !!d.na : false };
    });
    const missingPast = after.find((d) => d.iso <= nullEnd && d.q === null && d.iso < today);
    if (missingPast) return { state: 'bloque_donnee_manquante', peak: P, plus, missingDay: missingPast.iso, best, invalidated };
    if (p3 > lastIso || after.some((d) => d.iso <= nullEnd && d.q === null)) {
      const seen = plus.filter((d) => d.q !== undefined && d.q !== null).length;
      return { state: 'en_attente', peak: P, plus, remaining: 3 - seen, best, invalidated, closed: p3 > lastIso && lastIso < today };
    }
    return { state: 'confirme', peak: P, plus, criterionDay: p3, provisional: !tc, best, invalidated };
  }
  return { state: 'aucun_sommet', best, invalidated };
}

function labeler(start) {
  return {
    short: (iso) => (start ? `J${cycleDay(start, iso)}` : formatDateFR(iso)),
    long: (iso) => (start ? `J${cycleDay(start, iso)} (${formatDateFR(iso)})` : formatDateFR(iso)),
  };
}

/**
 * Critère glaire (spec §2.3.2, pseudo-code evaluerGlaire).
 * @param {Array<{ iso: string, q: number|null, na?: boolean }>} seq jours consécutifs du cycle jusqu'au dernier jour connu
 * @param {{ tc?: string|null, today: string, start?: string|null }} opts
 *   tc : date de confirmation de la température (ou null) ; start : J1 pour les libellés (null si inconnu)
 * @returns {{ kind: 'glaire', state: 'confirme'|'en_attente'|'bloque_donnee_manquante'|'aucun_sommet',
 *   peakDay: string|null, peakValue: number|null, criterionDay: string|null, lowQualityPeak: boolean,
 *   missingDay: string|null, provisional: boolean, explanation: string }}
 */
export function evaluateMucus(seq, { tc = null, today, start = null } = {}) {
  const res = findPeak(seq, { tc, today, minQ: 2 });
  const L = labeler(start);
  const out = {
    kind: 'glaire',
    state: res.state,
    peakDay: res.peak ? res.peak.iso : null,
    peakValue: res.peak ? res.peak.q : null,
    criterionDay: res.state === 'confirme' ? res.criterionDay : null,
    lowQualityPeak: !!res.peak && res.peak.q === 2,
    missingDay: res.missingDay ?? null,
    provisional: res.state === 'confirme' && res.provisional,
    explanation: '',
  };
  const code = (q) => (q === null || q === undefined ? 'non noté' : MUCUS_CODES[q]);
  const parts = [];
  if (res.state === 'aucun_sommet') {
    parts.push(res.best === null || res.best < 2
      ? 'Pas de glaire f, S ou S+ observée dans ce cycle pour l\'instant : pas de sommet.'
      : 'Pas de sommet identifiable pour l\'instant : la meilleure qualité de glaire est revenue après chaque sommet possible.');
  } else {
    const P = res.peak;
    const plusText = res.plus.map((d, n) => `P+${n + 1} ${d.q === undefined ? 'à venir' : code(d.q)}`).join(' · ');
    parts.push(P.bleed
      ? `Sommet ${res.state === 'confirme' ? '' : 'possible '}le ${L.long(P.iso)} : saignement hors règles, compté comme une glaire S+. ${plusText}.`
      : `Sommet ${res.state === 'confirme' ? '' : 'possible '}le ${L.long(P.iso)} en ${code(P.q)}, dernier jour de la meilleure qualité de glaire. ${plusText}.`);
    if (res.state === 'confirme') {
      parts.push(endDot(`3 jours consécutifs observés de qualité inférieure : critère glaire rempli le soir du ${L.long(res.criterionDay)}`));
      if (P.bleed) {
        parts.push(tc
          ? `Pas de glaire f, S ou S+ observée jusqu'à la confirmation de la température (${L.short(tc)}).`
          : 'Provisoire : à revérifier jusqu\'à la confirmation de la température (une glaire f, S ou S+ observée d\'ici là ferait tomber ce sommet).');
      } else {
        parts.push(tc
          ? `Pas de retour d'une glaire ${code(P.q)} ou meilleure jusqu'à la confirmation de la température (${L.short(tc)}).`
          : 'Provisoire : à revérifier jusqu\'à la confirmation de la température (un retour de glaire de même qualité ferait tomber ce sommet).');
      }
    } else if (res.state === 'en_attente') {
      parts.push(res.closed
        ? 'Les règles suivantes sont arrivées avant les 3 jours de qualité inférieure : critère non rempli.'
        : `Il faut 3 jours consécutifs observés de qualité inférieure après le sommet${res.remaining > 0 ? ` (encore ${res.remaining})` : ''}, ${P.bleed ? 'sans glaire f, S ou S+' : 'sans retour de la même qualité'} jusqu'à la confirmation de la température.`);
    } else {
      parts.push(`La glaire du ${L.long(res.missingDay)} n'est pas notée : un jour non observé peut cacher un retour de glaire fertile, le critère est bloqué. Complète-le seulement si tu te souviens de ce que tu as réellement observé.`);
    }
    if (out.lowQualityPeak) parts.push('Sommet de faible qualité (f) : une conseillère peut aider à interpréter.');
  }
  const returns = res.invalidated.filter((x) => x.isReturn);
  if (returns.length) {
    const last = returns[returns.length - 1];
    parts.push(last.bleed
      ? `Saignement du ${L.short(last.peak)} écarté comme sommet (glaire f, S ou S+ observée ensuite le ${L.short(last.by)}).`
      : `Sommet possible du ${L.short(last.peak)} écarté (retour d'une glaire de même qualité ou meilleure le ${L.short(last.by)}).`);
  }
  out.explanation = parts.join(' ');
  return out;
}

/**
 * Critère col (spec §2.3.3) : fin de la phase fertile le soir du 3e jour calendaire consécutif
 * observé « fermé et dur » après le dernier jour « modifié », sans retour d'un état fertile jusqu'à Tc.
 * @param {Array<{ iso: string, q: 0|1|null, na?: boolean }>} seq valeurs de cervixValue
 * @param {{ tc?: string|null, today: string, start?: string|null }} opts
 * @returns {{ kind: 'col', state: string, peakDay: string|null, peakValue: null, criterionDay: string|null,
 *   lowQualityPeak: false, missingDay: string|null, provisional: boolean, explanation: string }}
 */
export function evaluateCervix(seq, { tc = null, today, start = null } = {}) {
  const res = findPeak(seq, { tc, today, minQ: 1 });
  const L = labeler(start);
  const out = {
    kind: 'col',
    state: res.state,
    peakDay: res.peak ? res.peak.iso : null,
    peakValue: null,
    criterionDay: res.state === 'confirme' ? res.criterionDay : null,
    lowQualityPeak: false,
    missingDay: res.missingDay ?? null,
    provisional: res.state === 'confirme' && res.provisional,
    explanation: '',
  };
  const parts = [];
  if (res.state === 'aucun_sommet') {
    parts.push('Pas de changement du col observé dans ce cycle pour l\'instant : pas de fin de phase fertile par le col.');
  } else {
    parts.push(endDot(`Dernier jour « col modifié »${res.state === 'confirme' ? '' : ' possible'} : ${L.long(res.peak.iso)}`));
    if (res.state === 'confirme') {
      parts.push(endDot(`3 jours consécutifs observés « fermé et dur » : critère col rempli le soir du ${L.long(res.criterionDay)}`));
      if (!tc) parts.push('Provisoire : à revérifier jusqu\'à la confirmation de la température.');
    } else if (res.state === 'en_attente') {
      parts.push(res.closed
        ? 'Les règles suivantes sont arrivées avant 3 jours « fermé et dur » : critère non rempli.'
        : 'Il faut 3 jours consécutifs observés « fermé et dur », sans retour d\'un état fertile jusqu\'à la confirmation de la température.');
    } else {
      parts.push(`Le col du ${L.long(res.missingDay)} n'est pas noté : le critère est bloqué. Complète-le seulement si tu te souviens de ce que tu as réellement observé.`);
    }
  }
  parts.push('Le col ne s\'utilise jamais seul : le double contrôle avec la température reste obligatoire.');
  out.explanation = parts.join(' ');
  return out;
}
