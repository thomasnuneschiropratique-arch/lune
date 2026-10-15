/**
 * Alertes santé et rappels de test de grossesse.
 * Spec : docs/spec-medicale.md §2.1, §2.2.6, §2.7.3, §2.9, §3.1, §3.4, §4.5, §5, §6.3, §6.4.
 *
 * Niveaux : 'urgent' (agir maintenant : contraception d'urgence, 15/112),
 * 'attention' (faire quelque chose dans les jours qui viennent), 'info' (à savoir, sans urgence).
 * Les ids sont stables d'une analyse à l'autre (fondés sur des dates, pas sur des positions).
 */

import { addDays, diffDays, formatDateFR, selectAlertCycles } from './predict.js';
import { sexNeedsProtection } from './fertility.js';

const LEVEL_ORDER = { urgent: 0, attention: 1, info: 2 };
const RNP_KINDS = new Set(['non_protege', 'incident']);
const BLEEDING_REAL = new Set(['spotting', 'leger', 'moyen', 'abondant']);
const BLEEDING_RANK = { spotting: 1, leger: 2, moyen: 3, abondant: 4 };
const H72 = 72 * 60;
const H120 = 120 * 60;

/* ------------------------------------------------------------------ */
/* Temps absolu (heure locale de l'appareil → minutes, sûr au 25/10)    */
/* ------------------------------------------------------------------ */

/**
 * Heure 'HH:MM' valide (00:00 à 23:59), sinon null. Une heure invalide compte comme inconnue :
 * jamais une heure plus tardive que 00:00 pour calculer une date limite [PRUDENT].
 */
function validTime(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(':').map(Number);
  return hh < 24 && mm < 60 ? time : null;
}

function toMinutes(iso, time) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = validTime(time);
  const [hh, mm] = t ? t.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm).getTime() / 60000;
}

function formatDateTimeFR(minutes) {
  const dt = new Date(minutes * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const mm = dt.getMinutes();
  return `${formatDateFR(iso)} à ${dt.getHours()} h${mm ? ` ${pad(mm)}` : ''}`;
}

function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

const plural = (n, s, p) => `${n} ${n > 1 ? p : s}`;

/** Hachage court et stable d'un texte (djb2, base 36). */
function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const learn = (article, label = 'En savoir plus') => ({ label, route: 'comprendre', params: { article } });

/* ------------------------------------------------------------------ */
/* Extraction des données                                              */
/* ------------------------------------------------------------------ */

/** Dates (≤ aujourd'hui) des tests de grossesse, triées. */
function pregnancyTests(entries, today) {
  return Object.keys(entries).filter((iso) => iso <= today && entries[iso]?.pregnancyTest)
    .sort().map((iso) => ({ iso, result: entries[iso].pregnancyTest }));
}

/**
 * Rapports à risque (RNP) : sex 'non_protege' ou 'incident' un jour où le rapport demandait une
 * protection (contrat K2 sexNeedsProtection : n'importe quel jour du cycle 0, un jour sans statut,
 * un jour « protection nécessaire », et le jour de bascule avant 18:00, heure inconnue ou blocage
 * compris), quelle que soit l'heure de l'analyse.
 * Les rapports antérieurs de plus de 7 jours au retrait (DIU en place) sont ignorés.
 * Ajoute le RNP déclaré au démarrage (profile.rnpBeforeRemoval).
 * Chaque RNP : { iso, time ('HH:MM' valide ou null), minutes, uncertain }.
 */
function collectRnps(ctx) {
  const { entries, days, cycles, profile, today } = ctx;
  const removal = profile.iudRemovalDate ?? null;
  const windowStart = removal ? addDays(removal, -7) : null;
  const list = [];
  for (const iso of Object.keys(entries)) {
    const e = entries[iso];
    if (iso > today || !RNP_KINDS.has(e?.sex)) continue;
    if (windowStart && iso < windowStart) continue;
    const st = days[iso];
    const inCycle0 = !!st && (st.overlays?.includes('cycle0') || cycles[st.cycleIndex]?.isCycle0);
    if (!sexNeedsProtection(st, e.sexTime, { cycle0: inCycle0 })) continue;
    const time = validTime(e.sexTime);
    list.push({ iso, time, minutes: toMinutes(iso, time), uncertain: false });
  }
  if (removal && removal <= today && (profile.rnpBeforeRemoval === 'oui' || profile.rnpBeforeRemoval === 'ne_sait_pas')) {
    const known = profile.rnpBeforeRemoval === 'oui' && profile.rnpBeforeRemovalDate;
    // Date inconnue : on retient le jour du retrait (le plus tardif possible, prudent).
    const iso = known ? profile.rnpBeforeRemovalDate : removal;
    if (!list.some((r) => r.iso === iso)) list.push({ iso, time: null, minutes: toMinutes(iso, null), uncertain: !known });
  }
  return list.sort((a, b) => a.minutes - b.minutes);
}

/** Une contraception d'urgence enregistrée après ce rapport ? (même jour sans heure : oui) */
function emergencyTakenAfter(entries, rnp) {
  return Object.keys(entries).some((iso) => {
    const e = entries[iso];
    if (!e?.emergencyContraception || iso < rnp.iso) return false;
    if (iso > rnp.iso || !e.emergencyContraceptionTime) return true;
    return toMinutes(iso, e.emergencyContraceptionTime) >= rnp.minutes;
  });
}

/** Jours de saignement (hors post-retrait) d'un intervalle. */
function bleedingDays(entries, from, to) {
  const out = [];
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) if (BLEEDING_REAL.has(entries[iso]?.bleeding)) out.push(iso);
  return out;
}

/* ------------------------------------------------------------------ */
/* Règles d'alerte                                                     */
/* ------------------------------------------------------------------ */

/** §6.4 : test positif → ressources et signes d'urgence (GEU). */
function positiveTestAlert(ctx) {
  const { current, tests } = ctx;
  const since = current?.start ?? '0000-01-01';
  const pos = tests.filter((t) => t.result === 'positif' && t.iso >= since).at(-1);
  if (!pos) return null;
  return {
    id: `test-positif:${pos.iso}`,
    level: 'attention',
    title: 'Test de grossesse positif',
    text: `Tu as noté un test positif le ${formatDateFR(pos.iso)}. Douleur d'un côté du ventre, saignement, malaise ou douleur au bout de l'épaule : appelle le 15 ou le 112 (grossesse extra-utérine possible). `
      + 'Sinon, prends rendez-vous avec un médecin ou une sage-femme. Pour en parler librement : 0 800 08 11 11 (gratuit, anonyme).',
    action: learn('test-positif', 'Et maintenant ?'),
  };
}

/** §6.3 : RNP récent (< 120 h) un jour fertile, sans CU enregistrée après → urgent. */
function emergencyContraceptionAlert(ctx) {
  const { rnps, entries, profile, nowMin, lastJ1 } = ctx;
  const removal = profile.iudRemovalDate;
  if (removal && nowMin < toMinutes(removal, profile.iudRemovalTime)) return null;  // DIU encore en place
  const known = rnps.filter((r) => !r.uncertain && (!lastJ1 || r.iso >= lastJ1));
  const last = known.filter((r) => nowMin >= r.minutes && nowMin - r.minutes < H120).at(-1);
  if (!last || emergencyTakenAfter(entries, last)) return null;

  const first = known[0];
  const iudLimit = first.minutes + H120;
  const parts = [`Rapport à risque le ${formatDateTimeFR(last.minutes)}.`];
  parts.push(nowMin < iudLimit
    ? `Le plus efficace : un DIU au cuivre posé par une médecin ou une sage-femme, jusqu'au ${formatDateTimeFR(iudLimit)}.`
    : 'Au-delà de 120 h, une professionnelle peut parfois encore poser un DIU : appelle sans attendre.');
  parts.push(`En pharmacie, gratuite et sans ordonnance : pilule à l'ulipristal jusqu'au ${formatDateTimeFR(last.minutes + H120)}`
    + (nowMin < last.minutes + H72 ? `, ou au lévonorgestrel jusqu'au ${formatDateTimeFR(last.minutes + H72)}.` : '.'));
  if (nowMin - first.minutes > 21 * 24 * 60) parts.push('Un rapport à risque date de plus de 21 jours : fais d\'abord un test de grossesse.');
  return {
    id: `cu:${last.iso}:${last.minutes}`,
    level: 'urgent',
    title: 'Contraception d\'urgence possible',
    text: parts.join(' '),
    // Contrat K9 : le parcours Urgence calcule les délais depuis CE rapport, jamais depuis « maintenant ».
    action: { label: 'Voir quoi faire maintenant', route: 'urgence', params: { date: last.iso, time: last.time ?? null } },
  };
}

/**
 * §3.1.4 : RNP dans les 7 jours avant un retrait encore à venir (réponse du profil,
 * ou rapport à risque noté dans le journal depuis J−7 du retrait).
 * Heure de retrait inconnue : l'alerte reste affichée toute la journée du retrait (23:59) [PRUDENT] ;
 * l'alerte CU, elle, compte depuis 00:00 : le jour du retrait, les deux coexistent.
 * Couverture par une pilule d'urgence calculée en minutes absolues depuis le rapport le plus récent
 * (heure inconnue : 00:00, donc jamais de date limite trop tardive).
 */
function rnpBeforeRemovalAlert(ctx) {
  const { profile, nowMin, today, entries } = ctx;
  const removal = profile.iudRemovalDate;
  if (!removal) return null;
  const removalTime = validTime(profile.iudRemovalTime) ?? '23:59';
  if (nowMin >= toMinutes(removal, removalTime)) return null;
  const windowStart = addDays(removal, -7);
  const logged = Object.keys(entries)
    .filter((iso) => iso >= windowStart && iso <= today && RNP_KINDS.has(entries[iso]?.sex)).sort().at(-1) ?? null;
  let answer = profile.rnpBeforeRemoval;
  const profileDate = answer === 'oui' ? profile.rnpBeforeRemovalDate ?? null : null;
  if (logged) answer = 'oui';
  if (answer !== 'oui' && answer !== 'ne_sait_pas') return null;

  // Rapport le plus récent (journal ou profil), en minutes absolues.
  const candidates = [];
  if (profileDate) candidates.push({ iso: profileDate, time: null, minutes: toMinutes(profileDate, null) });
  if (logged) {
    const time = validTime(entries[logged]?.sexTime);
    candidates.push({ iso: logged, time, minutes: toMinutes(logged, time) });
  }
  const rnp = candidates.sort((a, b) => a.minutes - b.minutes).at(-1) ?? null;

  const since = formatDateFR(windowStart);
  const parts = [answer === 'oui'
    ? `Rapport sans préservatif ou incident depuis le ${since} : dis-le à la professionnelle AVANT le retrait.`
    : `Tu n'es pas sûre de ne pas avoir eu de rapport à risque depuis le ${since} : parles-en à la professionnelle AVANT le retrait.`];
  parts.push('Elle peut proposer de reporter le retrait (première option), une contraception d\'urgence ou la pose d\'un DIU au cuivre.');
  let action = learn('apres-retrait');
  if (rnp) {
    const elapsed = nowMin - rnp.minutes;
    const hormonalNote = profile.iudType === 'hormonal' || profile.iudType === 'inconnu'
      ? ' Avec un DIU hormonal, l\'ulipristal pourrait être moins efficace : le lévonorgestrel ou un DIU au cuivre peuvent être préférés, à voir avec la professionnelle.'
      : '';
    if (elapsed < H120) {
      parts.push(`Ton rapport du ${formatDateFR(rnp.iso)} est encore couvert : une pilule d'urgence est encore possible, à l'ulipristal jusqu'au ${formatDateTimeFR(rnp.minutes + H120)}`
        + (elapsed < H72 ? `, ou au lévonorgestrel jusqu'au ${formatDateTimeFR(rnp.minutes + H72)}.` : '.')
        + hormonalNote);
    } else if (rnp.time === null && diffDays(rnp.iso, today) === 5) {
      // Heure inconnue : compté depuis 00:00 le délai est passé, mais le rapport a pu avoir lieu plus tard ce jour-là.
      parts.push(`Selon l'heure de ton rapport du ${formatDateFR(rnp.iso)}, l'ulipristal (jusqu'à 120 h) est peut-être encore possible aujourd'hui : vérifie tout de suite avec l'heure exacte dans le parcours Urgence.${hormonalNote}`);
      action = { label: 'Vérifier avec l\'heure exacte', route: 'urgence', params: { date: rnp.iso, time: null } };
    } else {
      parts.push(`Ton rapport du ${formatDateFR(rnp.iso)} n'est plus couvert par une pilule d'urgence : parles-en avant le retrait.`);
    }
    parts.push(`Si le risque n'est pas supprimé : test de grossesse le ${formatDateFR(addDays(rnp.iso, 21))}.`);
  }
  return {
    id: 'rnp-avant-retrait',
    level: answer === 'oui' ? 'urgent' : 'attention',
    title: 'À dire avant le retrait',
    text: parts.join(' '),
    action,
  };
}

/**
 * Date de règles attendue fiable (§6.4.5) : jamais au cycle 0, au cycle 1 ni après une CU.
 * On prend la date centrale initiale (avant recentrage), qui ne glisse pas avec le retard.
 */
function reliableExpectedPeriod(ctx) {
  const { current, predictions } = ctx;
  if (!current || current.isCycle0 || current.postRemovalNumber === 0 || current.postRemovalNumber === 1) return null;
  if (current.flags?.emergencyContraception) return null;
  if (!predictions?.nextPeriod || predictions.method === 'aucune') return null;
  return predictions.nextPeriod.initialDate ?? predictions.nextPeriod.date;
}

/** §6.4 : rappel de test de grossesse après le DERNIER rapport à risque. */
function pregnancyTestReminder(ctx) {
  const { rnps, tests, lastJ1, today } = ctx;
  const relevant = rnps.filter((r) => !lastJ1 || r.iso >= lastJ1);  // de vraies règles arrêtent le rappel
  if (!relevant.length) return null;
  const last = relevant[relevant.length - 1].iso;
  const due21 = addDays(last, 21);
  const negatives = tests.filter((t) => t.result === 'negatif' && t.iso >= last);
  if (negatives.some((t) => t.iso >= due21)) return null;
  const earlyNegative = negatives.at(-1);

  let due = due21;
  const expected = reliableExpectedPeriod(ctx);
  if (!earlyNegative && expected && addDays(expected, 5) < due21) due = addDays(expected, 5);

  const parts = [`Dernier rapport à risque le ${formatDateFR(last)}. Un test fait à partir du ${formatDateFR(due21)} (21 jours après) permet d'exclure une grossesse.`];
  if (earlyNegative) parts.push(`Ton test négatif du ${formatDateFR(earlyNegative.iso)} est non concluant : il a été fait moins de 21 jours après ce rapport.`);
  if (due !== due21) parts.push(`Si tes règles ne sont pas là le ${formatDateFR(due)}, fais un test dès ce jour-là.`);
  if (today >= due) {
    return {
      id: `test-grossesse:${last}`,
      level: 'attention',
      title: 'C\'est le moment de faire un test de grossesse',
      text: parts.join(' ') + ' Un test urinaire convient, à n\'importe quel moment de la journée. Note ensuite le résultat.',
      action: { label: 'Noter le résultat', route: 'noter', params: { date: today } },
    };
  }
  return {
    id: `test-grossesse:${last}`,
    level: 'info',
    title: `Test de grossesse à prévoir le ${formatDateFR(due)}`,
    text: parts.join(' '),
    action: learn('test-grossesse'),
  };
}

/** §2.7.3, §2.9, §3.4 : retard de règles et aménorrhée. */
function lateAlerts(ctx) {
  const { current, predictions, stats, profile, today, tests } = ctx;
  if (!current) return [];
  // DIU encore en place : pas de retard ni d'aménorrhée à signaler (spec §3.4).
  if (current.isCycle0 && profile.iudRemovalDate && profile.iudRemovalDate > today) return [];
  const removal = profile.iudRemovalDate;
  const ref = current.isCycle0 ? (removal && removal <= today && removal >= current.start ? removal : current.start) : current.start;
  const sinceRef = diffDays(ref, today);
  const refLabel = !current.isCycle0 ? 'tes dernières règles' : ref === removal ? 'le retrait' : 'le début de ton suivi';

  if (addMonths(ref, 3) <= today) {
    return [{
      id: `amenorrhee:${ref}`,
      level: 'attention',
      title: 'Plus de 3 mois sans règles',
      text: `Pas de règles depuis ${refLabel} (${formatDateFR(ref)}). Fais un test de grossesse si ce n'est pas déjà fait ; s'il est négatif, prends rendez-vous avec ton médecin ou ta sage-femme.`
        + (ref === removal ? ' Si tes cycles étaient irréguliers avant la pose, on attend parfois 6 mois.' : ''),
      action: learn('quand-consulter'),
    }];
  }

  const reasons = [];
  if (predictions?.late) reasons.push(`${plural(predictions.late.days, 'jour', 'jours')} après la fin de la fenêtre estimée`);
  if (!current.isCycle0 && stats?.cycleLength && sinceRef > stats.cycleLength.max + 3) {
    reasons.push(`ce cycle dépasse déjà ton cycle le plus long (${stats.cycleLength.max} jours) de plus de 3 jours`);
  }
  if (sinceRef >= 42) reasons.push(`${sinceRef} jours sans règles depuis ${refLabel}`);
  if (!reasons.length) return [];

  const negs = tests.filter((t) => t.result === 'negatif' && t.iso >= current.start);
  const lastNeg = negs.at(-1);
  let advice = 'Fais un test de grossesse (urinaire, à n\'importe quel moment de la journée).';
  if (lastNeg) {
    const secondNeg = negs.some((t) => diffDays(t.iso, lastNeg.iso) >= 3);
    advice = secondNeg
      ? 'Deux tests négatifs et toujours pas de règles : prends rendez-vous avec ton médecin ou ta sage-femme.'
      : diffDays(lastNeg.iso, today) < 3
        ? `Ton test du ${formatDateFR(lastNeg.iso)} était négatif : s'il n'y a toujours pas de règles, refais-en un 3 à 7 jours plus tard, puis consulte s'il est encore négatif.`
        : `Ton test du ${formatDateFR(lastNeg.iso)} était négatif : refais-en un maintenant ; s'il est encore négatif, consulte ton médecin ou ta sage-femme.`;
  }
  return [{
    id: `retard:${current.start}`,
    level: 'attention',
    title: 'Règles en retard',
    text: `Tes règles se font attendre : ${reasons.join(' ; ')}. ${advice} Le stress, un voyage ou une maladie peuvent aussi décaler un cycle.`,
    action: learn('test-grossesse'),
  }];
}

/** §2.2.6 : contrôles de plausibilité sur le cycle en cours et le précédent. */
function plausibilityAlerts(ctx) {
  const { current, previous, stats, entries, today } = ctx;
  const out = [];
  if (!current) return out;
  const t = current.temp ?? {};
  const cycleDay = diffDays(current.start, today) + 1;

  if (!current.isCycle0 && t.state === 'confirmee' && Number.isFinite(t.fhmCycleDay) && t.fhmCycleDay <= 8) {
    out.push({
      id: `fhm-precoce:${current.start}`,
      level: 'attention',
      title: 'Montée très précoce',
      text: `Ta température est montée dès J${t.fhmCycleDay}. Vérifie que le J1 (${formatDateFR(current.start)}) correspondait bien à de vraies règles.`,
      action: { label: 'Vérifier le J1', route: 'noter', params: { date: current.start } },
    });
  }

  // Cycle déclaré non évaluable : la montée observée (contrat K4) suffit pour proposer un test.
  if ((t.state === 'confirmee' || t.evaluatedState === 'confirmee') && t.fhm) {
    const hp = diffDays(t.fhm, today) + 1;
    const n = stats?.highPhase?.n ?? 0;
    const threshold = n >= 3 ? Math.min(19, stats.highPhase.max + 3) : 19;
    if (hp >= threshold) {
      out.push({
        id: `phase-haute-longue:${current.start}`,
        level: 'attention',
        title: 'Fais un test de grossesse',
        text: `Ta phase haute dure depuis ${hp} jours sans règles${threshold < 19 ? ` (ta plus longue : ${stats.highPhase.max} jours)` : ''}. Fais un test de grossesse pour en avoir le cœur net.`,
        action: learn('test-grossesse'),
      });
    }
  }

  if (!current.isCycle0 && !current.flags?.unevaluable && t.state !== 'confirmee' && t.state !== 'non_evaluable' && cycleDay > 35) {
    out.push({
      id: `monophasique:${current.start}`,
      level: 'info',
      title: 'Pas encore de montée de température',
      text: `J${cycleDay} sans montée confirmée : cycle probablement sans ovulation pour l'instant. Tu restes fertile, une ovulation tardive reste possible.`,
      action: learn('decalages'),
    });
  }

  const excl = Object.keys(entries).filter((iso) => iso >= current.start && iso <= today && entries[iso]?.tempExcluded).length;
  const lows = (t.referenceDays ?? []).map((iso) => entries[iso]?.temp).filter(Number.isInteger);
  const n = lows.length;
  const sum = lows.reduce((s, x) => s + x, 0);
  const sumSq = lows.reduce((s, x) => s + x * x, 0);
  // Écart-type des valeurs basses > 0,15 °C, en entiers : n·Σx² − (Σx)² > 15²·n·(n−1).
  const unstableLows = n >= 2 && n * sumSq - sum * sum > 225 * n * (n - 1);
  if (excl > 2 || unstableLows) {
    out.push({
      id: `courbe-instable:${current.start}`,
      level: 'attention',
      title: 'Courbe instable',
      text: (excl > 2 ? `${excl} températures exclues dans ce cycle. ` : 'Tes valeurs basses varient beaucoup (plus de 0,15 °C d\'écart-type). ')
        + 'Mesure au réveil, avant de te lever, à la même heure et avec le même thermomètre. Si la perturbation dure, tu peux déclarer le cycle non évaluable.',
      action: learn('temperature'),
    });
  }

  const recent = ctx.completed.slice(-3).filter((c) => Number.isFinite(c.highPhaseLength));
  const shortCount = recent.filter((c) => c.highPhaseLength < 10).length;
  if (shortCount >= 2) {
    out.push({
      id: 'phase-haute-courte-repetee',
      level: 'info',
      title: 'Phases hautes courtes',
      text: `Phase haute de moins de 10 jours dans ${shortCount} de tes 3 derniers cycles. Ce n'est pas une urgence ; à évoquer avec ton médecin ou ta sage-femme en cas de projet de grossesse.`,
      action: learn('phases'),
    });
  } else if (previous && Number.isFinite(previous.highPhaseLength) && previous.highPhaseLength < 10 && !ctx.bleedSoonAfterFhm) {
    out.push({
      id: `phase-haute-courte:${previous.start}`,
      level: 'info',
      title: 'Phase haute courte',
      text: `Ta phase haute n'a duré que ${previous.highPhaseLength} jours au cycle précédent (moins de 10). Ce n'est pas une urgence ; si ça se répète, parles-en à ton médecin ou ta sage-femme.`,
      action: learn('phases'),
    });
  }
  return out;
}

/** Premier jour de l'épisode de saignement qui contient `iso` (au plus 1 jour de pause, pas avant `floor`). */
function episodeStart(entries, iso, floor) {
  let start = iso;
  for (;;) {
    const prev = [addDays(start, -1), addDays(start, -2)].find((d) => d >= floor && BLEEDING_REAL.has(entries[d]?.bleeding));
    if (!prev) return start;
    start = prev;
  }
}

/** §2.1 : saignement au cycle 0, < 10 jours après la FHM, ou après une contraception d'urgence. */
function intermediateBleedingAlerts(ctx) {
  const { current, previous, entries, today } = ctx;
  if (!current) return [];
  const t = current.temp ?? {};
  const out = [];
  const warning = 'Un saignement intermédiaire peut ressembler à des règles.';
  const outsidePeriod = (iso) => !current.periodDays?.includes(iso);

  if (current.isCycle0) {
    const from = addDays(today, -4) > current.start ? addDays(today, -4) : current.start;
    const recent = bleedingDays(entries, from, today).at(-1);
    const episode = recent ? episodeStart(entries, recent, current.start) : null;
    if (recent && entries[episode]?.cycleStart === true) {
      // J1 confirmé au plus tard le jour du retrait : il ne démarre pas le cycle 1 (spec §2.1, cycle 0).
      out.push({
        id: `saignement-cycle0:${episode}`,
        level: 'info',
        title: 'Règles avant le retrait',
        text: 'Ces règles ont commencé avant le retrait du stérilet (ou le jour même) : elles ne comptent pas comme premier cycle après le retrait. Tu restes dans le cycle 0, entièrement protégé, jusqu\'à tes premières vraies règles après le retrait.',
        action: { label: 'Voir ce jour', route: 'noter', params: { date: episode } },
      });
    } else if (recent) {
      const spotting = entries[recent].bleeding === 'spotting';
      out.push({
        id: `saignement-cycle0:${episode}`,
        level: 'info',
        title: 'Saignement noté',
        text: spotting
          ? `${warning} Un spotting ne démarre jamais un cycle : attends un vrai saignement de règles.`
          : `${warning} Si ce sont de vraies règles, d'abondance habituelle, confirme-le comme J1.`,
        action: { label: spotting ? 'Voir ce jour' : 'Confirmer mes règles', route: 'noter', params: { date: recent } },
      });
    }
    return out;
  }

  if (t.fhm) {
    const soon = bleedingDays(entries, addDays(t.fhm, 1), today)
      .filter((iso) => outsidePeriod(iso) && diffDays(t.fhm, iso) < 10)[0];
    if (soon) {
      out.push({
        id: `saignement-apres-montee:${soon}`,
        level: 'attention',
        title: 'Saignement peu après la montée',
        text: `Saignement ${diffDays(t.fhm, soon)} jours après ta montée de température. ${warning} Ne le confirme comme J1 que s'il s'agit de vraies règles, d'abondance habituelle.`,
        action: learn('test-grossesse'),
      });
    }
  }

  const cuDate = current.flags?.emergencyContraception;
  if (cuDate) {
    const afterCu = bleedingDays(entries, cuDate, today).filter(outsidePeriod)[0];
    if (afterCu) {
      out.push({
        id: `saignement-apres-cu:${afterCu}`,
        level: 'info',
        title: 'Saignement après la contraception d\'urgence',
        text: `${warning} Garde le préservatif jusqu'à de vraies règles, d'abondance habituelle ; confirme-les seulement à ce moment-là.`,
        action: learn('contraception-urgence'),
      });
    }
  }

  const cycleDay = diffDays(current.start, today) + 1;
  if (previous && cycleDay <= 10) {
    const gap = previous.temp?.fhm ? diffDays(previous.temp.fhm, current.start) : null;
    if (gap != null && gap < 10) {
      ctx.bleedSoonAfterFhm = true;
      out.push({
        id: `saignement-apres-montee:${current.start}`,
        level: 'attention',
        title: 'Règles arrivées tôt après la montée',
        text: `Tes règles ont commencé ${gap} jours après la montée de température. ${warning} Si ce saignement est plus léger ou plus court que d'habitude, ou s'accompagne de douleurs inhabituelles, fais un test de grossesse.`,
        action: learn('test-grossesse'),
      });
    } else {
      if (previous.flags?.emergencyContraception) {
        out.push({
          id: `regles-apres-cu:${current.start}`,
          level: 'info',
          title: 'Règles après la contraception d\'urgence',
          text: `${warning} Si ce saignement est plus léger ou plus court que d'habitude, ou s'accompagne de douleurs inhabituelles, fais un test de grossesse.`,
          action: learn('test-grossesse'),
        });
      }
      const rnpAlert = periodAfterRnpAlert(ctx);
      if (rnpAlert) out.push(rnpAlert);
    }
  }
  return out;
}

/**
 * §6.4 étape 6 : règles arrivées après un rapport à risque du cycle précédent (incertains compris),
 * sans test négatif à J+21 ou plus. De vraies règles arrêtent le rappel J+21 : on propose un test
 * immédiat si elles sont anormalement légères ou courtes. Niveau attention si elles le sont déjà.
 */
function periodAfterRnpAlert(ctx) {
  const { current, previous, cycles, entries, stats, tests, today } = ctx;
  // Cycle 0 précédent : tout RNP retenu (depuis J−7 du retrait) compte.
  const lower = previous.isCycle0 ? '0000-01-01' : previous.start;
  const rnp = ctx.rnps.filter((r) => r.iso >= lower && r.iso < current.start)
    .filter((r) => !tests.some((t) => t.result === 'negatif' && t.iso >= addDays(r.iso, 21)))
    .at(-1);
  if (!rnp) return null;

  const period = (current.periodDays ?? []).filter((iso) => iso <= today);
  const ended = period.length > 0 && period.at(-1) < today && !BLEEDING_REAL.has(entries[today]?.bleeding);
  const minLength = stats?.periodLength?.min ?? 2;
  const shortPeriod = ended && period.length < minLength;
  const maxRank = (days) => days.reduce((m, iso) => Math.max(m, BLEEDING_RANK[entries[iso]?.bleeding] ?? 0), 0);
  const before = cycles.filter((c) => c !== current && !c.isCycle0 && c.end != null && (c.periodDays ?? []).length).slice(-3);
  const usuallyStrong = before.length > 0
    && before.filter((c) => maxRank(c.periodDays) >= BLEEDING_RANK.moyen).length * 2 >= before.length;
  const lightPeriod = ended && usuallyStrong && maxRank(period) <= BLEEDING_RANK.leger;
  const abnormal = shortPeriod || lightPeriod;

  return {
    id: `regles-apres-rnp:${current.start}`,
    level: abnormal ? 'attention' : 'info',
    title: 'Règles après un rapport à risque',
    text: `Tu as eu un rapport à risque le ${rnp.iso.slice(8, 10)}/${rnp.iso.slice(5, 7)}. Un saignement peut ressembler à des règles. `
      + (abnormal
        ? 'Tes règles semblent plus légères ou plus courtes que d\'habitude : fais un test de grossesse dès maintenant.'
        : 'Si ces règles sont plus légères ou plus courtes que d\'habitude, ou s\'accompagnent de douleurs inhabituelles, fais un test de grossesse dès maintenant.'),
    action: learn('test-grossesse'),
  };
}

/** §2.9 et §5.3 : alertes FIGO, SOPK. */
function figoAlerts(ctx) {
  const { cycles, data, stats, today } = ctx;
  const out = [];
  const usable = selectAlertCycles(cycles, data);
  const last6 = usable.slice(-6);
  const outOfRange = last6.filter((c) => c.length < 24 || c.length > 38).length;
  if (outOfRange >= 2) {
    out.push({
      id: 'figo-frequence',
      level: 'info',
      title: 'Cycles hors de la norme',
      text: `${outOfRange} de tes ${last6.length} derniers cycles sont en dehors de 24 à 38 jours. Sans urgence, parles-en à ton médecin ou ta sage-femme lors d'une prochaine consultation.`,
      action: learn('quand-consulter'),
    });
  }
  const veryLong = usable.filter((c) => c.length > 90).at(-1);
  if (veryLong) {
    out.push({
      id: `cycle-90:${veryLong.start}`,
      level: 'info',
      title: 'Cycle de plus de 90 jours',
      text: `Ton cycle du ${formatDateFR(veryLong.start)} a duré ${veryLong.length} jours. Un cycle de plus de 90 jours compte comme irrégulier : parles-en à ton médecin ou ta sage-femme, sans urgence.`,
      action: learn('quand-consulter'),
    });
  }
  const reg = stats?.regularity;
  if (reg?.status === 'irreguliers') {
    out.push({
      id: 'figo-regularite',
      level: 'info',
      title: 'Cycles irréguliers',
      text: `${plural(reg.spread, 'jour', 'jours')} d'écart entre ton cycle le plus court et le plus long (repère pour ton âge : ${reg.threshold} jours au plus). À évoquer sans urgence avec ton médecin ou ta sage-femme.`,
      action: learn('quand-consulter'),
    });
  }
  const long35 = last6.filter((c) => c.length > 35).length;
  const knownStarts = cycles.filter((c) => !c.isCycle0).map((c) => c.start);
  const yearAgo = addDays(today, -365);
  const fewPerYear = knownStarts.length > 0 && knownStarts[0] <= yearAgo && knownStarts.filter((s) => s > yearAgo).length < 8;
  if (long35 >= 2 || fewPerYear) {
    out.push({
      id: 'sopk',
      level: 'info',
      title: 'Cycles longs',
      text: (fewPerYear ? 'Moins de 8 cycles sur les 12 derniers mois. ' : `${long35} cycles de plus de 35 jours récemment. `)
        + 'Le stress, le poids ou l\'arrêt d\'une contraception hormonale peuvent l\'expliquer ; c\'est aussi un signe possible de SOPK, à évoquer avec un médecin.',
      action: learn('sopk'),
    });
  }
  return out;
}

/** §2.9, §4.5, §4.7, §5.2-5.3 : règles longues ou abondantes, saignements hors règles, douleurs. */
function bleedingAndPainAlerts(ctx) {
  const { cycles, current, entries, today } = ctx;
  const out = [];
  if (!current) return out;
  const known = cycles.filter((c) => !c.isCycle0);

  const longPeriod = known.slice(-2).filter((c) => c.periodLength > 8).at(-1);
  if (longPeriod) {
    out.push({
      id: `regles-longues:${longPeriod.start}`,
      level: 'info',
      title: 'Règles de plus de 8 jours',
      text: `Tes règles du ${formatDateFR(longPeriod.start)} ont duré ${longPeriod.periodLength} jours. Parles-en à ton médecin ou ta sage-femme, sans urgence. Malaise ou grande faiblesse : appelle le 15.`,
      action: learn('regles-abondantes'),
    });
  }

  const period = current.isCycle0 ? [] : (current.periodDays ?? []);
  const heavy = period.some((iso) => entries[iso]?.bleeding === 'abondant');
  const tired = period.some((iso) => (entries[iso]?.symptoms ?? []).some((s) => s === 'fatigue' || s === 'vertiges'));
  if (heavy && tired && diffDays(current.start, today) < 14) {
    out.push({
      id: `regles-abondantes-fatigue:${current.start}`,
      level: 'info',
      title: 'Règles abondantes et fatigue',
      text: 'Règles abondantes avec fatigue ou vertiges : parles-en à ton médecin, une prise de sang peut vérifier l\'anémie. Malaise ou grande faiblesse : appelle le 15.',
      action: learn('regles-abondantes'),
    });
  }

  // Saignement hors règles : hors période, hors post-retrait, hors 2 jours précédant un J1,
  // sur les cycles après le retrait (les spottings sous DIU ne comptent pas).
  const removal = ctx.profile.iudRemovalDate;
  const recentCycles = known.filter((c) => !removal || c.start >= removal).slice(-6);
  const withIntermenstrual = recentCycles.filter((c) => {
    const last = c.end ? addDays(c.end, -2) : addDays(today, -2);
    return bleedingDays(entries, c.start, last).some((iso) => !c.periodDays?.includes(iso));
  }).length;
  if (withIntermenstrual >= 2) {
    out.push({
      id: 'saignement-intermenstruel',
      level: 'attention',
      title: 'Saignements entre les règles',
      text: `Des saignements en dehors des règles sur ${withIntermenstrual} cycles récents. C'est à faire vérifier dans les jours qui viennent : médecin, sage-femme ou centre de santé sexuelle.`,
      action: learn('quand-consulter'),
    });
  }

  const painful = recentCycles.filter((c) => (c.periodDays ?? []).some((iso) => entries[iso]?.pain >= 8)).length;
  if (painful >= 2) {
    out.push({
      id: 'douleur-regles',
      level: 'info',
      title: 'Règles très douloureuses',
      text: `Douleurs de 8/10 ou plus pendant les règles, sur ${painful} cycles. Ces douleurs sont fréquentes et ont plusieurs causes possibles, dont l'endométriose : elles méritent d'en parler à ton médecin ou ta sage-femme. Douleur qui s'aggrave malgré les antalgiques : appelle le 15.`,
      action: learn('endometriose'),
    });
  }
  return out;
}

/** Avertissements du cycle en cours (cycle.warnings) → info. */
function cycleWarningAlerts(ctx, skipIntermediate) {
  const { current } = ctx;
  return (current?.warnings ?? [])
    .filter((w) => typeof w === 'string' && w && !(skipIntermediate && /saignement intermédiaire/i.test(w)))
    .map((w) => ({ id: `avertissement:${current.start}:${hash(w)}`, level: 'info', title: 'À vérifier', text: w }));
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Calcule les alertes santé et les rappels de test de grossesse.
 * @param {{ cycles: object[], days: object, predictions: object, stats: object, data: object, now: { today: string, time?: string } }} input
 * @returns {Array<{ id: string, level: 'urgent'|'attention'|'info', title: string, text: string, action?: { label: string, route: string, params: object } }>}
 *   triées urgent > attention > info (ordre d'insertion conservé à niveau égal), ids uniques.
 */
export function computeAlerts({ cycles = [], days = {}, predictions = null, stats = null, data, now }) {
  const today = now.today;
  const entries = data?.days ?? {};
  const current = cycles.length ? cycles[cycles.length - 1] : null;
  const completed = cycles.filter((c) => c.end != null);
  const ctx = {
    cycles, days: days ?? {}, predictions, stats, data, today, entries, current, completed,
    previous: cycles.length >= 2 ? cycles[cycles.length - 2] : null,
    profile: data?.profile ?? {},
    nowMin: toMinutes(today, now.time),
    lastJ1: current && !current.isCycle0 ? current.start : null,
    tests: pregnancyTests(entries, today),
    bleedSoonAfterFhm: false,
  };
  ctx.rnps = collectRnps(ctx);

  const positive = positiveTestAlert(ctx);
  const bleeding = intermediateBleedingAlerts(ctx);  // avant plausibilityAlerts (pose bleedSoonAfterFhm)
  const candidates = [
    emergencyContraceptionAlert(ctx),
    positive,
    rnpBeforeRemovalAlert(ctx),
    positive ? null : pregnancyTestReminder(ctx),
    ...(positive ? [] : lateAlerts(ctx)),
    ...bleeding,
    ...plausibilityAlerts(ctx).filter((a) => !(positive && /^(phase-haute-longue|monophasique):/.test(a.id))),
    ...figoAlerts(ctx),
    ...bleedingAndPainAlerts(ctx),
    ...cycleWarningAlerts(ctx, bleeding.length > 0),
  ];

  const seen = new Set();
  const out = [];
  for (const a of candidates) {
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => LEVEL_ORDER[x.a.level] - LEVEL_ORDER[y.a.level] || x.i - y.i)
    .map(({ a }) => a);
}
