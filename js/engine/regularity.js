// Sélection des cycles valides et régularité FIGO 2018 (spec §2.5.4, §2.7.1 B, §2.9).
//
// Module partagé par le statut (mode strict FSRH, cycles.js) et par les statistiques
// (predict.js) : une seule définition de « cycle valide » et de « cycles réguliers ».
// N'importe que dates.js (contrat K5).

import { isValidISO } from './dates.js';

/** Nombre maximal de cycles valides retenus (les plus récents). */
export const MAX_VALID_CYCLES = 12;

/** Nombre minimal de cycles valides pour classer la régularité (spec §2.9). */
export const MIN_REGULARITY_CYCLES = 6;

/**
 * Cycle terminé, hors cycle 0, hors cycles d'avant le retrait, hors atypiques,
 * hors contraception d'urgence et hors non évaluables (sans condition de durée).
 * Un cycle « d'avant le retrait » commence avant profile.iudRemovalDate (ou porte preRemoval: true).
 * @param {object} c Cycle
 * @param {object} data AppData
 * @returns {boolean}
 */
export function isEligibleCycle(c, data) {
  if (!c || c.end == null || c.length == null || c.isCycle0 || c.preRemoval === true) return false;
  const removal = data?.profile?.iudRemovalDate ?? null;
  if (removal && c.start < removal) return false;
  const f = c.flags ?? {};
  return !f.atypical && !f.emergencyContraception && !f.unevaluable;
}

/**
 * Cycles valides pour les prédictions et les statistiques (spec §2.7.1 B) :
 * cycles éligibles de 15 à 90 jours, les `limit` plus récents, ordre chronologique.
 * @param {object[]} cycles
 * @param {object} data
 * @param {number} [limit=12]
 * @returns {object[]}
 */
export function selectValidCycles(cycles, data, limit = MAX_VALID_CYCLES) {
  return cycles.filter((c) => isEligibleCycle(c, data) && c.length >= 15 && c.length <= 90).slice(-limit);
}

/**
 * Cycles pris en compte pour les alertes FIGO : éligibles, ≥ 15 jours,
 * y compris les cycles > 90 jours (gardés pour les alertes, spec §2.7.1 B).
 * @param {object[]} cycles
 * @param {object} data
 * @returns {object[]}
 */
export function selectAlertCycles(cycles, data) {
  return cycles.filter((c) => isEligibleCycle(c, data) && c.length >= 15);
}

/**
 * Seuil FIGO de régularité (écart max entre cycle le plus court et le plus long) selon l'âge.
 * Âge inconnu : seuil le plus strict (7 j) [PRUDENT, non précisé par la spec].
 * @param {number|null} birthYear
 * @param {string} today 'YYYY-MM-DD'
 * @returns {number|null} null hors 18–45 ans (pas de classement FIGO)
 */
export function ageThreshold(birthYear, today) {
  if (!Number.isInteger(birthYear)) return 7;
  if (!isValidISO(today)) return null;
  const age = Number(today.slice(0, 4)) - birthYear;
  if (age >= 18 && age <= 25) return 9;
  if (age >= 26 && age <= 41) return 7;
  if (age >= 42 && age <= 45) return 9;
  return null;
}

/**
 * Régularité FIGO des cycles valides (spec §2.9) : classée seulement avec au moins
 * 6 cycles valides et un âge entre 18 et 45 ans (ou inconnu, seuil 7 j) ; sinon « inconnu ».
 * @param {object[]} cycles Cycle[] (seuls les cycles valides comptent)
 * @param {object} data AppData (profile.iudRemovalDate, profile.birthYear)
 * @param {string} today 'YYYY-MM-DD'
 * @returns {{ status: 'reguliers'|'irreguliers'|'inconnu', spread: number|null, threshold: number|null, n: number }}
 */
export function regularityOf(cycles, data, today) {
  const valid = selectValidCycles(Array.isArray(cycles) ? cycles : [], data);
  const lengths = valid.map((c) => c.length);
  const threshold = ageThreshold(data?.profile?.birthYear ?? null, today);
  const n = lengths.length;
  if (n < MIN_REGULARITY_CYCLES) return { status: 'inconnu', spread: null, threshold, n };
  const spread = Math.max(...lengths) - Math.min(...lengths);
  const status = threshold == null ? 'inconnu' : spread <= threshold ? 'reguliers' : 'irreguliers';
  return { status, spread, threshold, n };
}
