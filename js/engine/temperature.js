// Température basale (spec §2.2) : arrondi au 0,05 °C, valeurs valides, exclusions,
// détection de la montée (règle « 3 sur 6 », exceptions 1 et 2, valeur
// supplémentaire post-hormonale), limite de trous, test LH positif après la montée.
//
// Toutes les températures sont des centièmes entiers (3647 = 36,47 °C) : aucune
// comparaison ne se fait en virgule flottante.

import { cycleDay, diffDays, endDot, formatDateFR } from './dates.js';

/** Nombre maximal de jours calendaires sans valeur valide entre V[i−6] et Tc inclus (spec §2.2.3.8). */
export const MAX_TROUS_FENETRE = 2;
export const TEMP_MIN = 3400;
export const TEMP_MAX = 4200;

const DISTURBANCE_LABELS = {
  maladie: 'maladie', alcool: 'alcool', nuit_courte: 'nuit courte', heure_inhabituelle: 'heure inhabituelle',
  voyage: 'voyage', stress: 'stress', medicament: 'médicament', autre: 'autre',
};

const FAIL_TEXT = {
  deux_retombees: 'les 2e et 3e valeurs ne sont pas au-dessus de la ligne',
  exception1: 'la 3e valeur est au-dessus de la ligne sans atteindre +0,20, et la 4e ne dépasse pas la ligne (exception 1 non remplie)',
  exception2: 'après la valeur retombée, la 3e valeur haute n\'atteint pas la ligne + 0,20 (exception 2 non remplie ; les exceptions ne se combinent jamais)',
  extra: 'la valeur supplémentaire exigée après un DIU hormonal n\'est pas au-dessus de la ligne',
};

/**
 * Arrondi au pas de 0,05 °C le plus proche, sur des entiers (spec §2.2.2) :
 * reste 1-2 vers le bas, 3-4 vers le haut (jamais d'égalité).
 * @param {number} c centièmes entiers (ex. 3647)
 * @returns {number} centièmes arrondis (ex. 3645)
 */
export function roundTo005(c) {
  const r = ((c % 5) + 5) % 5;
  return r >= 3 ? c - r + 5 : c - r;
}

/**
 * Vrai si `c` est une température plausible en centièmes entiers (34,00 à 42,00 °C).
 * @param {unknown} c
 * @returns {boolean}
 */
export function isValidTemp(c) {
  return Number.isInteger(c) && c >= TEMP_MIN && c <= TEMP_MAX;
}

/**
 * Centièmes → « 36,55 » (sans unité).
 * @param {number} c
 * @returns {string}
 */
export function formatTempShort(c) {
  const s = String(c);
  return `${s.slice(0, -2)},${s.slice(-2)}`;
}

/**
 * Centièmes → « 36,55 °C ».
 * @param {number} c
 * @returns {string}
 */
export function formatTemp(c) {
  return `${formatTempShort(c)} °C`;
}

function formatDelta(c) {
  const sign = c < 0 ? '−' : '+';
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')} °C`;
}

function hasMotif(rec) {
  return Array.isArray(rec.disturbances) && rec.disturbances.some((d) => typeof d === 'string' && d.length > 0);
}

/** Jours calendaires sans valeur valide entre V[a] et V[b] inclus. */
function gapsBetween(V, a, b) {
  return diffDays(V[a].iso, V[b].iso) + 1 - (b - a + 1);
}

/**
 * Évalue une candidate (pseudo-code de référence, spec §2.2.4).
 * Renvoie { state: 'confirme'|'en_attente'|'echec', rule, tcIndex, high, ignored, plusIndex, expected, reason }.
 * high : indices des valeurs comptées (1, 2, 3[, 4, 5]) ; plusIndex : indice de la valeur qui devait atteindre +0,20.
 */
function evaluateCandidate(V, i, L, extra) {
  const at = (k) => (i + k < V.length ? V[i + k].r : undefined);
  const s1 = at(1);
  const s2 = at(2);
  const fL = formatTemp(L);
  const f20 = formatTemp(L + 20);
  const extraTail = extra ? `, puis une valeur supplémentaire au-dessus de ${fL} (exigée après un DIU hormonal ou de type inconnu)` : '';
  const pending = (high, ignored, expected) => ({ state: 'en_attente', high, ignored, expected });
  const confirmed = (tcIndex, rule, high, ignored, plusIndex) => ({ state: 'confirme', tcIndex, rule, high, ignored, plusIndex });
  const failed = (reason, high, ignored) => ({ state: 'echec', reason, high, ignored });

  if (s1 === undefined) return pending([i], [], `encore 2 valeurs au-dessus de ${fL}, dont la 2e à ${f20} ou plus${extraTail}`);
  if (s2 === undefined) {
    return s1 > L
      ? pending([i, i + 1], [], `une valeur à ${f20} ou plus (si elle dépasse ${fL} sans atteindre ${f20}, il faudra encore une valeur au-dessus de ${fL} ; si elle retombe à ${fL} ou moins, il faudra ensuite une valeur à ${f20} ou plus)${extraTail}`)
      : pending([i], [i + 1], `encore 2 valeurs : la prochaine au-dessus de ${fL}, la suivante à ${f20} ou plus${extraTail}`);
  }
  const b1 = s1 > L;
  const b2 = s2 > L;
  const extraPending = (high, ignored) => pending(high, ignored, `encore 1 valeur au-dessus de ${fL} (valeur supplémentaire exigée après un DIU hormonal ou de type inconnu)`);

  if (b1 && b2) {
    if (s2 - L >= 20) {
      // Règle régulière.
      const high = [i, i + 1, i + 2];
      if (!extra) return confirmed(i + 2, 'reguliere', high, [], i + 2);
      const s3 = at(3);
      if (s3 === undefined) return extraPending(high, []);
      return s3 > L ? confirmed(i + 3, 'reguliere', [...high, i + 3], [], i + 2) : failed('extra', high, []);
    }
    // Exception 1 : 3e valeur au-dessus mais sous +0,20 → une 4e au-dessus de la ligne.
    const high = [i, i + 1, i + 2];
    const s3 = at(3);
    if (s3 === undefined) return pending(high, [], `encore 1 valeur au-dessus de ${fL}${extraTail}`);
    if (!(s3 > L)) return failed('exception1', high, []);
    if (!extra) return confirmed(i + 3, 'exception1', [...high, i + 3], [], null);
    const s4 = at(4);
    if (s4 === undefined) return extraPending([...high, i + 3], []);
    return s4 > L ? confirmed(i + 4, 'exception1', [...high, i + 3, i + 4], [], null) : failed('extra', [...high, i + 3], []);
  }
  if (b1 !== b2) {
    // Exception 2 : exactement une des valeurs s1, s2 retombe (non comptée) → s3 ≥ L + 20.
    const ignored = [b1 ? i + 2 : i + 1];
    const high = [i, b1 ? i + 1 : i + 2];
    const s3 = at(3);
    if (s3 === undefined) return pending(high, ignored, `une valeur à ${f20} ou plus${extraTail}`);
    if (!(s3 - L >= 20)) return failed('exception2', high, ignored);
    if (!extra) return confirmed(i + 3, 'exception2', [...high, i + 3], ignored, i + 3);
    const s4 = at(4);
    if (s4 === undefined) return extraPending([...high, i + 3], ignored);
    return s4 > L ? confirmed(i + 4, 'exception2', [...high, i + 3, i + 4], ignored, i + 3) : failed('extra', [...high, i + 3], ignored);
  }
  return failed('deux_retombees', [i], [i + 1, i + 2]);
}

/**
 * Recherche de la montée sur les valeurs valides (spec §2.2.4, trois états).
 * Une candidate CONFIRMÉE est rejetée si elle a trop de trous (> maxGaps) ou si un test LH
 * positif est daté du jour de sa FHM ou après (la recherche continue alors plus loin).
 * Une candidate EN_ATTENTE arrête la recherche (sauf rejet LH).
 * @param {Array<{iso: string, r: number, raw?: number}>} V valeurs valides arrondies, chronologiques
 * @param {{ extra?: number|boolean, maxGaps?: number, lhPositive?: string[] }} [opts]
 * @returns {{ state: 'confirmee'|'en_attente'|'en_attente_valeurs_basses'|'aucune_montee',
 *   candidate: object|null, trace: object[] }}
 *   trace : toutes les candidates examinées { i, L, fhm, outcome, reason?, rejected?, gaps?, lhDate? }.
 */
export function searchRise(V, { extra = 0, maxGaps = MAX_TROUS_FENETRE, lhPositive = [] } = {}) {
  const trace = [];
  const ex = extra ? 1 : 0;
  if (V.length < 7) return { state: 'en_attente_valeurs_basses', candidate: null, trace };
  for (let i = 6; i < V.length; i++) {
    let L = V[i - 6].r;
    for (let k = i - 5; k < i; k++) if (V[k].r > L) L = V[k].r;
    if (V[i].r <= L) continue;
    const res = evaluateCandidate(V, i, L, ex);
    const entry = { i, L, fhm: V[i].iso, outcome: res.state, reason: res.reason ?? null, res };
    trace.push(entry);
    if (res.state === 'echec') continue;
    const lhDate = lhPositive.find((d) => d >= V[i].iso);
    if (lhDate) {
      entry.rejected = 'lh';
      entry.lhDate = lhDate;
      continue;
    }
    if (res.state === 'confirme') {
      const gaps = gapsBetween(V, i - 6, res.tcIndex);
      entry.gaps = gaps;
      if (gaps > maxGaps) {
        entry.rejected = 'trous';
        continue;
      }
      return { state: 'confirmee', candidate: entry, trace };
    }
    return { state: 'en_attente', candidate: entry, trace };
  }
  return { state: 'aucune_montee', candidate: null, trace };
}

function buildValues(records, excluded) {
  const V = [];
  for (const rec of records) {
    if (isValidTemp(rec.temp) && !excluded.has(rec.iso)) V.push({ iso: rec.iso, r: roundTo005(rec.temp), raw: rec.temp });
  }
  return V;
}

/**
 * Évaluation complète de la température d'un cycle (spec §2.2.3-2.2.4).
 *
 * Exclusions :
 * - acceptée seulement avec un motif (tempDisturbances non vide) ; sans motif, la valeur reste valide ;
 * - refusée si, à l'évaluation sans cette exclusion, la valeur occupe la position s1, s2, s3 ou s4
 *   d'une candidate examinée et est ≤ à la ligne de cette candidate (contournement de l'exception 2) ;
 *   pour la candidate retenue, seules les positions jusqu'à Tc comptent ;
 * - une exclusion postérieure à Tc est enregistrée mais sans effet (elle ne peut de toute façon
 *   pas modifier l'évaluation : aucune valeur postérieure à Tc n'est examinée).
 *
 * @param {Array<{ iso: string, temp?: number|null, excluded?: boolean, disturbances?: string[] }>} records
 *   un enregistrement par jour mesuré (ou exclu), dans le cycle, jusqu'à aujourd'hui
 * @param {{ extra?: number|boolean, maxGaps?: number, lhPositive?: string[], start?: string|null }} [opts]
 *   extra : valeur post-hormonale ; maxGaps : modifiable seulement à la baisse ; lhPositive : dates des tests
 *   LH positifs du cycle ; start : J1 du cycle pour les libellés « Jn » (null si inconnu).
 * @returns {object} champs `temp` du contrat (sauf fhmCycleDay calculé si start est fourni) + détails :
 *   ineffectiveExclusions, unmotivatedExclusions, rejectedCandidates, failedCandidates, validCount, lhDates.
 */
export function evaluateTemperature(records, opts = {}) {
  const extra = opts.extra ? 1 : 0;
  const maxGaps = Number.isInteger(opts.maxGaps) && opts.maxGaps >= 0 ? Math.min(opts.maxGaps, MAX_TROUS_FENETRE) : MAX_TROUS_FENETRE;
  const lhPositive = [...(opts.lhPositive ?? [])].filter((d) => typeof d === 'string').sort();
  const start = opts.start ?? null;
  const recs = [...(records ?? [])].filter((r) => r && typeof r.iso === 'string').sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));

  const motivated = recs.filter((r) => r.excluded === true && hasMotif(r));
  const unmotivated = recs.filter((r) => r.excluded === true && !hasMotif(r) && isValidTemp(r.temp)).map((r) => r.iso);
  const accepted = new Set(motivated.map((r) => r.iso));
  const refused = [];
  const run = () => {
    const V = buildValues(recs, accepted);
    return { V, res: searchRise(V, { extra, maxGaps, lhPositive }) };
  };

  // Refus des exclusions qui contournent l'exception 2 (point fixe : les refus ne font que réduire l'ensemble).
  const withValue = motivated.filter((r) => isValidTemp(r.temp));
  let changed = true;
  while (changed) {
    changed = false;
    for (const x of withValue) {
      if (!accepted.has(x.iso)) continue;
      accepted.delete(x.iso);
      const { V, res } = run();
      const k = V.findIndex((v) => v.iso === x.iso);
      // Positions s1..s4 de chaque candidate examinée ; pour la candidate retenue (confirmée, non rejetée),
      // les valeurs postérieures à Tc ne sont plus des positions contrôlées : leur exclusion est
      // « sans effet » (spec §2.2.3 règle 4), pas « refusée ». Une candidate rejetée (trous, LH)
      // garde ses 4 positions contrôlées [PRUDENT].
      const bypass = res.trace.some((c) => {
        const last = c.res.state === 'confirme' && !c.rejected ? Math.min(c.res.tcIndex, c.i + 4) : c.i + 4;
        return k > c.i && k <= last && V[k].r <= c.L;
      });
      if (bypass) {
        refused.push(x.iso);
        changed = true;
        break;
      }
      accepted.add(x.iso);
    }
  }

  const { V, res } = run();
  const cand = res.candidate;
  const c = cand?.res ?? null;
  const confirmed = res.state === 'confirmee';
  const tcIso = confirmed ? V[c.tcIndex].iso : null;

  const acceptedList = [...accepted].sort();
  const excludedDays = confirmed ? acceptedList.filter((iso) => iso <= tcIso) : acceptedList;
  const ineffective = confirmed ? acceptedList.filter((iso) => iso > tcIso) : [];

  let gapsInWindow = 0;
  if (cand) gapsInWindow = gapsBetween(V, cand.i - 6, confirmed ? c.tcIndex : V.length - 1);

  let borderline = false;
  let borderlineDelta = null;
  if (confirmed && c.plusIndex != null) {
    const delta = V[c.plusIndex].raw - cand.L;
    if (delta >= 15 && delta <= 25) {
      borderline = true;
      borderlineDelta = delta;
    }
  }

  const rejected = res.trace.filter((t) => t.rejected).map((t) => ({ fhm: t.fhm, reason: t.rejected, gaps: t.gaps ?? null, lhDate: t.lhDate ?? null }));
  const failed = res.trace.filter((t) => t.outcome === 'echec').map((t) => ({ fhm: t.fhm, reason: t.reason }));

  const out = {
    state: res.state,
    fhm: cand ? cand.fhm : null,
    fhmCycleDay: cand && start ? cycleDay(start, cand.fhm) : null,
    coverline: cand ? cand.L : null,
    confirmDay: tcIso,
    rule: confirmed ? c.rule : null,
    extraValue: extra === 1,
    referenceDays: cand ? V.slice(cand.i - 6, cand.i).map((v) => v.iso) : [],
    highDays: c ? c.high.map((k) => V[k].iso) : [],
    ignoredDays: c ? c.ignored.filter((k) => k < V.length).map((k) => V[k].iso) : [],
    excludedDays,
    refusedExclusions: [...refused].sort(),
    gapsInWindow,
    borderline,
    lhDoubt: rejected.some((r) => r.reason === 'lh'),
    expected: res.state === 'en_attente' ? c.expected
      : res.state === 'en_attente_valeurs_basses' ? `encore ${7 - V.length} valeur${7 - V.length > 1 ? 's' : ''} valide${7 - V.length > 1 ? 's' : ''} (il faut 6 valeurs basses avant de pouvoir repérer une montée)`
        : null,
    explanation: '',
    ineffectiveExclusions: ineffective,
    unmotivatedExclusions: unmotivated,
    rejectedCandidates: rejected,
    failedCandidates: failed,
    validCount: V.length,
    lhDates: rejected.filter((r) => r.reason === 'lh').map((r) => r.lhDate),
  };
  out.explanation = explain(out, { V, cand, c, recs, start, maxGaps, borderlineDelta });
  return out;
}

function explain(out, { V, cand, c, recs, start, maxGaps, borderlineDelta }) {
  const label = (iso) => (start ? `J${cycleDay(start, iso)} (${formatDateFR(iso)})` : formatDateFR(iso));
  const short = (iso) => (start ? `J${cycleDay(start, iso)}` : formatDateFR(iso));
  const valueAt = (iso) => V.find((v) => v.iso === iso);
  const motifOf = (iso) => {
    const rec = recs.find((r) => r.iso === iso);
    const list = (rec?.disturbances ?? []).map((d) => DISTURBANCE_LABELS[d] ?? d);
    return list.length ? ` (${list.join(', ')})` : '';
  };
  const plural = (n, s, p) => (n > 1 ? p : s);
  const parts = ['Températures arrondies au 0,05 °C le plus proche avant toute comparaison.'];

  if (out.state === 'en_attente_valeurs_basses') {
    parts.push(`Il faut au moins 6 valeurs basses puis une valeur plus haute : ${out.validCount} ${plural(out.validCount, 'valeur valide', 'valeurs valides')} pour l'instant.`);
  }
  if (cand) {
    const refs = V.slice(cand.i - 6, cand.i).map((v) => `${short(v.iso)} ${formatTempShort(v.r)}`).join(' · ');
    parts.push(`Ligne auxiliaire à ${formatTemp(cand.L)} : la plus haute des 6 valeurs qui précèdent la 1re valeur haute (${refs}).`);
    parts.push(`1re valeur haute : ${label(cand.fhm)}, ${formatTemp(V[cand.i].r)}.`);
    if (out.state === 'confirmee') {
      const ruleText = {
        reguliere: 'Règle régulière : 3 valeurs consécutives au-dessus de la ligne, la 3e au moins 0,20 °C au-dessus.',
        exception1: 'Exception 1 : la 3e valeur est au-dessus de la ligne sans atteindre +0,20 °C, une 4e valeur au-dessus de la ligne a donc été exigée.',
        exception2: 'Exception 2 : une seule des 2e et 3e valeurs est retombée sur ou sous la ligne (non comptée) ; la 4e mesure (3e valeur haute comptée) dépasse la ligne d\'au moins 0,20 °C.',
      }[out.rule];
      parts.push(ruleText);
      if (out.extraValue) parts.push('Après un DIU hormonal ou de type inconnu, une valeur supplémentaire au-dessus de la ligne est exigée (sans exigence de +0,20 °C).');
    }
    const numbered = c.high.map((k, n) => `${n + 1} = ${formatTempShort(V[k].r)} (${short(V[k].iso)})`).join(' · ');
    parts.push(`Valeurs comptées : ${numbered}.`);
    if (out.ignoredDays.length) {
      parts.push(`Valeur retombée, non comptée : ${out.ignoredDays.map((iso) => `${short(iso)} ${formatTempShort(valueAt(iso).r)}`).join(' · ')}.`);
    }
    if (out.state === 'confirmee') parts.push(endDot(`Montée confirmée le ${label(out.confirmDay)}`));
    else parts.push(`En attente : ${out.expected}.`);
    if (out.gapsInWindow > 0) {
      parts.push(`${out.gapsInWindow} ${plural(out.gapsInWindow, 'jour', 'jours')} sans valeur valide entre ${short(V[cand.i - 6].iso)} et ${out.state === 'confirmee' ? 'la confirmation' : 'la dernière mesure'} (maximum ${maxGaps}).`);
      if (out.state === 'en_attente' && out.gapsInWindow > maxGaps) parts.push('Avec autant de trous, cette montée ne pourra pas être validée : la recherche continuera plus loin.');
    }
  }
  if (out.state === 'aucune_montee') parts.push('Pas de montée de température confirmée pour l\'instant.');

  for (const r of out.rejectedCandidates) {
    parts.push(r.reason === 'lh'
      ? `Montée à partir du ${short(r.fhm)} écartée : test LH positif le ${formatDateFR(r.lhDate)}, après la montée. Un test LH positif après la montée de température rend l'évaluation douteuse ; attends de nouvelles valeurs.`
      : `Montée à partir du ${short(r.fhm)} écartée : trop de données manquantes (${r.gaps} jours sans valeur, maximum ${maxGaps}).`);
  }
  for (const f of out.failedCandidates.slice(-3)) {
    parts.push(`Montée possible à partir du ${short(f.fhm)} non confirmée : ${FAIL_TEXT[f.reason]}.`);
  }
  if (out.excludedDays.length) {
    const inWindow = out.excludedDays.some((iso) => cand && iso >= V[cand.i - 6].iso && iso < cand.fhm);
    parts.push(`${plural(out.excludedDays.length, 'Valeur exclue', 'Valeurs exclues')} : ${out.excludedDays.map((iso) => `${short(iso)}${motifOf(iso)}`).join(', ')}.`
      + (inWindow ? ' Une exclusion parmi les valeurs basses abaisse la ligne auxiliaire : vérifie qu\'elle était justifiée.' : ''));
  }
  if (out.ineffectiveExclusions.length) {
    parts.push(`${plural(out.ineffectiveExclusions.length, 'Exclusion', 'Exclusions')} après la confirmation, sans effet (${out.ineffectiveExclusions.map(short).join(', ')}).`);
  }
  if (out.refusedExclusions.length) {
    parts.push(`${plural(out.refusedExclusions.length, 'Exclusion refusée', 'Exclusions refusées')} (${out.refusedExclusions.map(short).join(', ')}) : une valeur retombée pendant la montée ne peut pas être retirée, cela reviendrait à combiner les deux exceptions.`);
  }
  if (out.unmotivatedExclusions.length) {
    parts.push(`${plural(out.unmotivatedExclusions.length, 'Exclusion ignorée', 'Exclusions ignorées')} faute de motif (${out.unmotivatedExclusions.map(short).join(', ')}).`);
  }
  if (out.borderline) {
    parts.push(`Cas limite : la valeur du ${short(V[c.plusIndex].iso)} dépasse la ligne de ${formatDelta(borderlineDelta)} avant arrondi. Attendre 1 à 2 jours de plus est prudent.`);
  }
  return parts.join(' ');
}
