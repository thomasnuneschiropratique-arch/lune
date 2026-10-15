/**
 * Lune — vue « Calendrier » (route 'calendrier').
 *
 * Grille mensuelle lundi → dimanche (« Ciel de Lune ») :
 * - chaque case est PEINTE selon la DÉCISION du jour (decisionLook : protection hachurée + bouclier,
 *   jusqu'à 18 h, ou coche « sans protection ») — jamais selon l'état des règles seul (S1) ;
 *   un jour infertile selon les règles mais « retenu » (apprentissage, strict, cycle 0…) reste
 *   peint en protection, son état n'apparaît que dans l'aria-label et le titre ;
 * - les règles sont un MARQUEUR (barre « aube » en bas de case), jamais un fond (S3) ;
 * - le pointillé est réservé aux prévisions des jours futurs (predictions.futureDays, S2) ;
 * - repères (température, rapport, LH+, sommet, FHM), aujourd'hui encadré en couleur de marque.
 * En-tête : petit ciel de la phase en cours, avec la lune du jour.
 * Tap sur un jour : feuille de résumé (jour passé) ou de prévision (jour futur).
 * Navigation : boutons ‹ ›, « Aujourd'hui », flèches du clavier, glissement horizontal.
 */

import {
  h, icon, fmtDate, fmtTemp, statusBadge, addDays, todayParts, decisionLook, moonSvg,
  STATE_META, DECISION_META, OVERLAY_META, SKY_META,
  BLEEDING_LEVELS, MUCUS_SENSATIONS, MUCUS_ASPECTS, TEMP_DISTURBANCES, TEMP_ROUTES,
  CERVIX_OPENING, CERVIX_FIRMNESS, CERVIX_POSITION, LH_RESULTS, PREGNANCY_TEST_RESULTS,
  SEX_OPTIONS, EMERGENCY_CONTRACEPTIONS, CYCLE_EVENTS, SYMPTOMS, MOODS,
} from '../dom.js';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const PREDICTIONS_KEY = 'lune:cal:predictions';
const DEFAULT_LABEL = 'Estimation indicative. Ne l\'utilise pas comme contraception.';
const REMINDER = 'Les prévisions sont des estimations : elles ne disent jamais qu\'un jour est infertile.';
const SWIPE_MIN_PX = 50;

/** Prévisions des jours futurs : libellés (légende, feuille) et texte lu par les lecteurs d'écran. */
const FUTURE_META = {
  regles_prevues: {
    label: 'Règles prévues',
    aria: 'règles prévues',
    detail: 'Tes prochaines règles pourraient commencer autour de ce jour.',
  },
  fertile_estime: {
    label: 'Fenêtre fertile estimée',
    aria: 'fenêtre fertile estimée',
    detail: 'Ce jour tombe dans la fenêtre fertile estimée. Ce sont tes observations qui décideront.',
  },
  ovulation_estimee: {
    label: 'Ovulation estimée',
    aria: 'ovulation estimée',
    detail: 'L\'ovulation pourrait avoir lieu autour de ce jour. Une ovulation plus tardive reste possible.',
  },
  infertile_post_suite: {
    label: 'Suite de la phase infertile confirmée, si pas de règles',
    aria: 'suite de la phase infertile confirmée, si pas de règles',
    detail: 'Ce n\'est pas une estimation : le double contrôle est confirmé pour ce cycle, la phase infertile continue jusqu\'aux prochaines règles. Elle s\'arrête dès que tes règles arrivent.',
  },
};
const FUTURE_ORDER = ['regles_prevues', 'fertile_estime', 'ovulation_estimee', 'infertile_post_suite'];

const MUCUS_CODES = ['t', '∅', 'f', 'S', 'S+'];

/** Mois affiché ('YYYY-MM'), conservé entre deux rendus de la vue ; remis à zéro quand la date change. */
let shownMonth = null;
let shownForToday = null;

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');
const monthOf = (iso) => iso.slice(0, 7);
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** 'HH:MM' → « 6 h 40 ». */
function fmtTime(hhmm) {
  const [hh, mm] = String(hhmm).split(':');
  return `${Number(hh)} h ${mm}`;
}

/** Position dans la semaine, lundi = 0 … dimanche = 6. */
function weekdayIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Cases du mois : { lead: nb de cases vides avant le 1er (lundi = 0), dates: iso[] }. */
function monthLayout(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lead = weekdayIndex(`${ym}-01`);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates = Array.from({ length: count }, (_, i) => `${ym}-${pad2(i + 1)}`);
  return { lead, dates };
}

function labelOf(list, id) {
  const item = list.find((o) => o.id === id);
  return item ? item.label : null;
}

function labelsOf(list, ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => labelOf(list, id)).filter(Boolean);
}

function readPredictionsPref() {
  try {
    return sessionStorage.getItem(PREDICTIONS_KEY) !== '0';
  } catch {
    return true;
  }
}

function writePredictionsPref(on) {
  try {
    sessionStorage.setItem(PREDICTIONS_KEY, on ? '1' : '0');
  } catch {
    /* préférence non mémorisée : sans conséquence */
  }
}

/** Valeur q de la glaire saisie (max des champs renseignés), null si non observable. */
function mucusQ(entry) {
  if (!entry || entry.mucusDoubtful) return null;
  const s = MUCUS_SENSATIONS.find((o) => o.id === entry.mucusSensation);
  const a = MUCUS_ASPECTS.find((o) => o.id === entry.mucusAspect);
  const values = [s && s.value, a && a.value].filter((v) => typeof v === 'number');
  return values.length ? Math.max(...values) : null;
}

const isBleedingOverlay = (o) => o === 'regles' || o === 'spotting' || o === 'post_retrait';

function decisionMeta(status) {
  return status.protectionNeeded === false ? DECISION_META.libre : DECISION_META.protection;
}

/**
 * Aspect du bloc « décision » d'une feuille : suit le texte affiché (protectionNeeded),
 * 'pre' / 'safe' seulement si pas de protection, 'protect' sinon.
 */
function sheetDecisionKind(status) {
  if (status.protectionNeeded !== false) return 'protect';
  return status.state === 'INFERTILE_PRE' ? 'pre' : 'safe';
}

const ST_CLASS = { protect: 'st--protect', pre: 'st--pre', safe: 'st--safe', mixed: 'st--mixed' };

/** Bloc « décision » d'une feuille : pastille (même code que la grille) + titre + motif. */
function decisionBox(kind, iconName, title, text) {
  return h('div', { class: ['v-cal-sheet__decision', `v-cal-sheet__decision--${kind}`] },
    h('span', { class: ['st', 'st--sm', ST_CLASS[kind]], ariaHidden: 'true' }, icon(iconName, { size: 16 })),
    h('div', {},
      h('p', { class: 'v-cal-sheet__decision-title' }, title),
      text ? h('p', { class: 'v-cal-sheet__decision-text' }, text) : null));
}

/** Longueur de cycle pour la lune : moyenne des cycles valides, sinon 28. */
function moonLength(analysis) {
  const mean = Math.round(Number(analysis?.stats?.cycleLength?.mean));
  return Number.isFinite(mean) && mean >= 15 && mean <= 60 ? mean : 28;
}

/** Petites étoiles décoratives du bandeau de ciel. */
function starsSvg() {
  const stars = [[6, 10, 1.2], [20, 52, 0.9], [14, 78, 1.1], [84, 6, 1.3], [92, 60, 0.9], [62, 84, 1], [40, 4, 0.8]];
  return h('svg', { class: 'v-cal__stars', viewBox: '0 0 96 88', width: 96, height: 88, ariaHidden: 'true', focusable: 'false' },
    stars.map(([cx, cy, r]) => h('circle', { cx, cy, r })));
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

/**
 * Affiche la vue « Calendrier ».
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 */
export function render(root, ctx) {
  const today = ctx.now?.today || ctx.analysis?.now?.today || todayParts().today;
  if (shownForToday !== today || !shownMonth) {
    shownMonth = monthOf(today);
    shownForToday = today;
  }

  const analysis = ctx.analysis || {};
  const days = analysis.days || {};
  const predictions = analysis.predictions || null;
  const futureDays = (predictions && predictions.futureDays) || {};
  const entries = (ctx.data && ctx.data.days) || {};
  const showSex = ctx.data?.settings?.showSexLog !== false;
  const secondary = ctx.data?.profile?.secondarySign === 'col' ? 'col' : 'glaire';
  const currentCycle = analysis.cycles?.[analysis.current?.cycleIndex] || null;
  // Apprentissage / mode strict (ou jour d'aujourd'hui « retenu » : cycle 0, CU…) : l'état peut
  // être infertile, la protection reste nécessaire pendant le cycle.
  const todayStatus = analysis.current?.status || null;
  const heldToday = !!(todayStatus && decisionLook(todayStatus).held);
  const protectionForced = !!(currentCycle?.flags?.learning || currentCycle?.flags?.strictFSRH || heldToday);
  let showPredictions = readPredictionsPref();
  let suppressClick = false;
  let swipe = null;

  /* --- En-tête : petit ciel de la phase + lune du jour, ‹ Aujourd'hui › --- */
  const title = h('h2', { class: 'v-cal__title display', id: 'cal-title', ariaLive: 'polite' });
  const todayBtn = h('button', {
    type: 'button',
    class: 'btn btn--sm v-cal__today-btn',
    on: { click: () => goTo(monthOf(today), today) },
  }, icon('sunrise', { size: 18 }), 'Aujourd\'hui');
  const prevBtn = h('button', {
    type: 'button', class: 'iconbtn v-cal__nav', ariaLabel: 'Mois précédent',
    on: { click: () => goTo(shiftMonth(shownMonth, -1)) },
  }, icon('chevron-left', { size: 24 }));
  const nextBtn = h('button', {
    type: 'button', class: 'iconbtn v-cal__nav', ariaLabel: 'Mois suivant',
    on: { click: () => goTo(shiftMonth(shownMonth, 1)) },
  }, icon('chevron-right', { size: 24 }));

  // Ciel : celui de la phase en cours (data-phase sur <html>) ; jamais le mot « règles » (S7).
  const current = analysis.current || null;
  const skyPhase = SKY_META[current?.status?.phase] ? current.status.phase : 'inconnue';
  const skyName = SKY_META[skyPhase].sky;
  const curDay = Number.isInteger(current?.cycleDay) ? current.cycleDay : null;
  const skyLine = curDay !== null
    ? `Aujourd'hui · jour ${curDay}${current.isCycle0 ? ' du cycle 0' : ''} · ${skyName}`
    : capitalize(skyName);
  const moon = curDay !== null
    ? moonSvg(curDay, moonLength(analysis), { size: 56 })
    : moonSvg(4, 28, { size: 56, label: null });
  const head = h('section', { class: 'v-cal__sky sky', ariaLabelledby: 'cal-title' },
    h('div', { class: 'v-cal__sky-top' },
      h('div', { class: 'v-cal__sky-text' },
        h('p', { class: 'v-cal__sky-line' }, skyLine),
        title),
      h('span', { class: 'v-cal__moon' }, starsSvg(), moon)),
    h('div', { class: 'v-cal__sky-nav' }, prevBtn, todayBtn, nextBtn));

  /* --- Grille --- */
  const grid = h('div', {
    class: 'v-cal__grid',
    role: 'grid',
    ariaLabelledby: 'cal-title',
    ariaDescribedby: 'cal-grid-help',
    on: { keydown: onGridKeydown, click: onGridClick },
  });
  const gridWrap = h('div', {
    class: 'v-cal__swipe',
    on: { pointerdown: onPointerDown, pointerup: onPointerUp, pointercancel: () => { swipe = null; } },
  }, grid);

  /* --- Interrupteur des prévisions --- */
  const toggle = h('input', {
    type: 'checkbox',
    id: 'cal-show-predictions',
    class: 'v-cal__switch-input',
    role: 'switch',
    checked: showPredictions,
    on: {
      change: (e) => {
        showPredictions = e.target.checked;
        writePredictionsPref(showPredictions);
        drawMonth();
        drawPredictionNote();
        legendFuture.hidden = !showPredictions;
      },
    },
  });
  const predictionNote = h('div', { class: 'v-cal__pred-note stack stack--sm', ariaLive: 'polite' });
  const legendFuture = legendFutureSection();
  legendFuture.hidden = !showPredictions;

  const empty = analysis.current
    ? null
    : h('div', { class: 'card card--flat v-cal__empty stack stack--sm' },
      h('p', {}, 'Rien n\'est encore noté. Dès ta première saisie, ton cycle apparaîtra ici.'),
      h('div', {},
        h('button', {
          type: 'button', class: 'btn btn--primary btn--sm',
          on: { click: () => ctx.navigate('noter', { date: today }) },
        }, icon('plus', { size: 18 }), 'Noter aujourd\'hui')));

  root.append(h('div', { class: 'v-cal stack' },
    h('h1', { class: 'sr-only' }, 'Calendrier'),
    head,
    empty,
    gridWrap,
    h('p', { class: 'sr-only', id: 'cal-grid-help' },
      'Utilise les flèches pour changer de jour, Page précédente et Page suivante pour changer de mois. Entrée ouvre le détail du jour.'),
    h('div', { class: 'card v-cal__pred stack stack--sm' },
      h('div', { class: 'v-cal__switch' },
        h('label', { class: 'v-cal__switch-label', htmlFor: 'cal-show-predictions' },
          'Afficher les prévisions (indicatives)'),
        toggle),
      predictionNote),
    legend(),
    legendFuture,
    h('p', { class: 'v-cal__reminder' }, icon('info', { size: 18 }), h('span', {}, REMINDER)),
  ));

  drawMonth();
  drawPredictionNote();

  /* ---------------- Mois ---------------- */

  function goTo(ym, focusIso = null) {
    shownMonth = ym;
    drawMonth(focusIso);
  }

  /** Reconstruit la grille du mois affiché ; focusIso : jour à focaliser après le rendu. */
  function drawMonth(focusIso = null) {
    title.textContent = fmtDate(`${shownMonth}-01`, 'mois');
    const isCurrent = shownMonth === monthOf(today);

    const { lead, dates } = monthLayout(shownMonth);
    const tabbable = dates.includes(focusIso) ? focusIso : (isCurrent ? today : dates[0]);
    const cells = [
      ...Array.from({ length: lead }, () => h('div', { class: 'v-cal__cell v-cal__cell--pad', role: 'gridcell' })),
      ...dates.map((iso) => h('div', { class: 'v-cal__cell', role: 'gridcell' }, dayButton(iso, iso === tabbable))),
    ];
    while (cells.length % 7) cells.push(h('div', { class: 'v-cal__cell v-cal__cell--pad', role: 'gridcell' }));

    const rows = [h('div', { class: 'v-cal__row v-cal__row--head', role: 'row' },
      WEEKDAYS.map((name) => h('div', { class: 'v-cal__wd', role: 'columnheader' },
        h('span', { ariaHidden: 'true' }, name[0].toUpperCase()),
        h('span', { class: 'sr-only' }, name))))];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(h('div', { class: 'v-cal__row', role: 'row' }, cells.slice(i, i + 7)));
    }
    grid.replaceChildren(...rows);

    if (focusIso) {
      const btn = grid.querySelector(`[data-iso="${focusIso}"]`);
      if (btn) btn.focus();
    }
  }

  /**
   * Bouton d'une journée : fond peint selon la DÉCISION (S1), numéro, icône d'angle,
   * repères, barre « aube » des règles (S3) et libellé accessible complet.
   */
  function dayButton(iso, tabbable) {
    const isFuture = iso > today;
    const status = isFuture ? null : days[iso] || null;
    const entry = entries[iso] || null;
    const overlays = (status && Array.isArray(status.overlays)) ? status.overlays : [];
    const markers = (status && status.markers) || {};
    const future = isFuture && showPredictions ? (futureDays[iso] || []) : [];
    const classes = ['v-cal__day'];
    const aria = [fmtDate(iso, 'long')];
    const marks = [];
    let corner = null;
    let dawn = null;
    let title = null;

    if (status) {
      const look = decisionLook(status);
      classes.push(`v-cal__day--${look.kind}`);
      if (look.held) classes.push('v-cal__day--held');
      if (Number.isInteger(status.cycleDay)) {
        const cycle = analysis.cycles?.[status.cycleIndex];
        aria.push(cycle && cycle.isCycle0 ? `jour ${status.cycleDay} du cycle 0` : `jour ${status.cycleDay} du cycle`);
      }
      overlays.filter(isBleedingOverlay).forEach((o) => aria.push(OVERLAY_META[o].label.toLowerCase()));
      if (look.held || look.kind === 'mixed') {
        // Jour « retenu » : l'état des règles n'est dit qu'ici (et dans le titre), la case reste « protection ».
        aria.push(look.aria.toLowerCase());
        title = look.aria;
      } else {
        if (status.state !== 'FERTILE') aria.push((STATE_META[status.state] || STATE_META.INDETERMINE).short.toLowerCase());
        aria.push(decisionMeta(status).label.toLowerCase());
        title = `${look.rulesLabel} · ${look.label}`;
      }
      corner = icon(look.icon, { size: 14 });
      if (overlays.includes('regles')) dawn = h('span', { class: 'dawn-bar v-cal__dawn' });
    } else if (isFuture) {
      classes.push('v-cal__day--future');
      if (future.includes('infertile_post_suite')) {
        classes.push('v-cal__day--suite');
        corner = icon(protectionForced ? 'shield' : 'check', { size: 14 });
      } else if (future.includes('fertile_estime')) {
        corner = icon('shield', { size: 14 });
      }
      if (future.includes('regles_prevues')) dawn = h('span', { class: 'dawn-bar dawn-bar--forecast v-cal__dawn' });
      if (future.length) {
        aria.push(`prévision indicative : ${FUTURE_ORDER.filter((t) => future.includes(t)).map((t) => FUTURE_META[t].aria).join(', ')}`);
      } else aria.push('à venir');
      if (future.includes('infertile_post_suite') && protectionForced) aria.push('protection quand même nécessaire pendant ce cycle');
    } else {
      classes.push('v-cal__day--none');
      aria.push('hors suivi');
    }

    // Repères (les règles sont la barre « aube » ; spotting et saignement après retrait : goutte)
    const otherBleed = overlays.some((o) => o === 'spotting' || o === 'post_retrait');
    if (otherBleed || (!status && entry && entry.bleeding)) {
      marks.push(h('span', { class: 'v-cal__mark v-cal__mark--drop' }, icon('drop', { size: 10 })));
      if (!status) aria.push('saignement noté');
    }
    if (entry && typeof entry.temp === 'number') {
      // Le verdict du moteur prime : une exclusion demandée peut avoir été refusée.
      const excluded = status ? !!markers.excluded : !!entry.tempExcluded;
      marks.push(h('span', { class: ['v-cal__mark', 'v-cal__dot', excluded && 'v-cal__dot--hollow'] }));
      aria.push(excluded ? 'température exclue' : 'température notée');
    }
    if (showSex && entry && entry.sex) {
      marks.push(h('span', { class: 'v-cal__mark v-cal__mark--heart' }, icon('heart', { size: 10 })));
      aria.push('rapport noté');
    }
    if (entry && entry.lh === 'positif') {
      marks.push(h('span', { class: 'v-cal__mark v-cal__txt' }, 'LH+'));
      aria.push('LH positif');
    }
    if (markers.peak) {
      marks.push(h('span', { class: 'v-cal__mark v-cal__txt v-cal__txt--peak' }, 'P'));
      aria.push('sommet de glaire');
    }
    if (markers.fhm) {
      marks.push(h('span', { class: 'v-cal__mark v-cal__txt v-cal__txt--fhm' }, '↑'));
      aria.push('première valeur haute');
    }
    if (future.includes('ovulation_estimee')) {
      marks.push(h('span', { class: 'v-cal__mark v-cal__star' }, icon('star', { size: 11 })));
    }
    if (iso === today) {
      classes.push('is-today');
      aria.push('aujourd\'hui');
    }

    return h('button', {
      type: 'button',
      class: classes,
      tabIndex: tabbable ? 0 : -1,
      ariaLabel: aria.join(', '),
      title,
      attrs: { 'aria-current': iso === today ? 'date' : null },
      dataset: { iso },
    },
    h('span', { class: 'v-cal__num', ariaHidden: 'true' }, String(Number(iso.slice(8)))),
    corner ? h('span', { class: 'v-cal__corner', ariaHidden: 'true' }, corner) : null,
    h('span', { class: 'v-cal__marks', ariaHidden: 'true' }, marks),
    dawn ? h('span', { class: 'v-cal__dawnwrap', ariaHidden: 'true' }, dawn) : null);
  }

  /* ---------------- Interactions ---------------- */

  function onGridClick(e) {
    if (suppressClick) return;
    const btn = e.target.closest('[data-iso]');
    if (btn) openDay(btn.dataset.iso);
  }

  function onGridKeydown(e) {
    const btn = e.target.closest('[data-iso]');
    if (!btn) return;
    const iso = btn.dataset.iso;
    const dow = weekdayIndex(iso);
    const moves = {
      ArrowLeft: () => addDays(iso, -1),
      ArrowRight: () => addDays(iso, 1),
      ArrowUp: () => addDays(iso, -7),
      ArrowDown: () => addDays(iso, 7),
      Home: () => addDays(iso, -dow),
      End: () => addDays(iso, 6 - dow),
      PageUp: () => sameDayIn(iso, -1),
      PageDown: () => sameDayIn(iso, 1),
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    const target = moves[e.key]();
    if (monthOf(target) !== shownMonth) goTo(monthOf(target), target);
    else {
      const next = grid.querySelector(`[data-iso="${target}"]`);
      if (!next) return;
      btn.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }
  }

  /** Même quantième dans le mois voisin (borné au dernier jour du mois). */
  function sameDayIn(iso, n) {
    const ym = shiftMonth(monthOf(iso), n);
    const { dates } = monthLayout(ym);
    return dates[Math.min(Number(iso.slice(8)), dates.length) - 1];
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    swipe = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 350);
    goTo(shiftMonth(shownMonth, dx < 0 ? 1 : -1));
  }

  /* ---------------- Feuilles ---------------- */

  function openDay(iso) {
    if (!ctx.ui) return;
    if (iso > today) {
      openFuture(iso);
      return;
    }
    let close = () => {};
    const entry = entries[iso] || null;
    const status = days[iso] || null;
    const edit = h('button', {
      type: 'button',
      class: 'btn btn--primary btn--block',
      on: { click: () => { close(); ctx.navigate('noter', { date: iso }); } },
    }, icon('edit', { size: 18 }), entry ? 'Modifier ce jour' : 'Noter ce jour');
    const content = h('div', { class: 'v-cal-sheet stack' },
      status ? statusBlock(status) : h('p', { class: 'muted' }, 'Ce jour ne fait partie d\'aucun cycle suivi.'),
      status ? calcMarkers(iso, status) : null,
      entryBlock(entry),
      edit);
    close = ctx.ui.openSheet({ title: capitalize(fmtDate(iso, 'complet')), content });
  }

  function statusBlock(status) {
    const cycle = analysis.cycles?.[status.cycleIndex];
    const decision = decisionMeta(status);
    const overlays = (Array.isArray(status.overlays) ? status.overlays : []).filter((o) => OVERLAY_META[o]);
    return h('div', { class: 'stack stack--sm' },
      Number.isInteger(status.cycleDay)
        ? h('p', { class: 'eyebrow v-cal-sheet__eyebrow' }, cycle && cycle.isCycle0 ? `Jour ${status.cycleDay} du cycle 0` : `Jour ${status.cycleDay} du cycle`)
        : null,
      decisionBox(sheetDecisionKind(status), decision.icon, decision.label, status.decisionReason),
      h('div', { class: 'row' },
        statusBadge(status),
        overlays.map((o) => h('span', { class: ['badge', `badge--${OVERLAY_META[o].cls}`] },
          icon(OVERLAY_META[o].icon, { size: 16 }), h('span', {}, OVERLAY_META[o].label)))),
      status.stateReason ? h('p', { class: 'muted' }, status.stateReason) : null);
  }

  /** Repères du calcul pour ce jour (valeurs basses, hautes, sommet…). */
  function calcMarkers(iso, status) {
    const m = status.markers || {};
    const items = [];
    if (m.reference) items.push('Valeur basse de référence');
    if (m.fhm) items.push('Première valeur haute (FHM)');
    if (Number.isInteger(m.high)) items.push(`Valeur haute n° ${m.high}`);
    if (m.confirm) items.push('Montée de température confirmée');
    if (m.ignored) items.push('Valeur retombée, ignorée');
    if (m.excluded) items.push('Température exclue du calcul');
    if (m.peak) items.push('Sommet de glaire (P)');
    if (Number.isInteger(m.peakPlus)) items.push(`P+${m.peakPlus}`);
    if (m.missingTemp) items.push('Température manquante');
    if (m.missingSign) items.push(secondary === 'col' ? 'Col non noté' : 'Glaire non notée');
    const refused = analysis.cycles?.[status.cycleIndex]?.temp?.refusedExclusions;
    if (Array.isArray(refused) && refused.includes(iso)) items.push('Exclusion refusée par le calcul');
    if (!items.length) return null;
    return h('div', { class: 'stack stack--sm' },
      h('h3', { class: 'v-cal-sheet__h' }, 'Repères du calcul'),
      h('ul', { class: 'v-cal-sheet__tags' }, items.map((t) => h('li', {}, t))));
  }

  /** Valeurs saisies ce jour-là. */
  function entryBlock(entry) {
    if (!entry) return h('p', { class: 'muted' }, 'Rien de noté ce jour-là.');
    const rows = [];
    const add = (label, value) => { if (value) rows.push([label, value]); };

    if (entry.bleeding) {
      add('Saignement', [labelOf(BLEEDING_LEVELS, entry.bleeding), entry.cycleStart && '1er jour des règles'].filter(Boolean).join(' · '));
    }
    if (typeof entry.temp === 'number' || (entry.tempDisturbances || []).length) {
      const parts = [
        typeof entry.temp === 'number' ? fmtTemp(entry.temp) : 'Valeur non saisie',
        entry.tempTime && `à ${fmtTime(entry.tempTime)}`,
        entry.tempRoute && labelOf(TEMP_ROUTES, entry.tempRoute)?.toLowerCase(),
      ].filter(Boolean).join(', ');
      const disturb = labelsOf(TEMP_DISTURBANCES, entry.tempDisturbances);
      add('Température', [
        parts,
        disturb.length && `Perturbation : ${disturb.join(', ')}`,
        entry.tempDisturbanceNote,
        entry.tempExcluded && 'Exclusion demandée',
      ].filter(Boolean).join(' · '));
    }
    if (entry.mucusSensation || entry.mucusAspect || entry.mucusDoubtful) {
      const q = mucusQ(entry);
      add('Glaire', [
        q !== null ? MUCUS_CODES[q] : null,
        labelOf(MUCUS_SENSATIONS, entry.mucusSensation),
        labelOf(MUCUS_ASPECTS, entry.mucusAspect),
        entry.mucusDoubtful && 'Observation douteuse',
      ].filter(Boolean).join(' · '));
    }
    add('Col', [
      labelOf(CERVIX_OPENING, entry.cervixOpening),
      labelOf(CERVIX_FIRMNESS, entry.cervixFirmness),
      labelOf(CERVIX_POSITION, entry.cervixPosition),
    ].filter(Boolean).join(' · '));
    add('Test LH', labelOf(LH_RESULTS, entry.lh));
    add('Test de grossesse', labelOf(PREGNANCY_TEST_RESULTS, entry.pregnancyTest));
    if (showSex && entry.sex) {
      add('Rapport', [labelOf(SEX_OPTIONS, entry.sex), entry.sexTime && `à ${fmtTime(entry.sexTime)}`].filter(Boolean).join(', '));
    }
    if (entry.emergencyContraception) {
      add('Contraception d\'urgence', [labelOf(EMERGENCY_CONTRACEPTIONS, entry.emergencyContraception),
        entry.emergencyContraceptionTime && `à ${fmtTime(entry.emergencyContraceptionTime)}`].filter(Boolean).join(', '));
    }
    if (Number.isInteger(entry.pain)) add('Douleur', `${entry.pain} / 10`);
    add('Symptômes', labelsOf(SYMPTOMS, entry.symptoms).join(', '));
    add('Humeur', labelsOf(MOODS, entry.moods).join(', '));
    add('Événements', labelsOf(CYCLE_EVENTS, entry.events).join(', '));
    if (entry.cycleUnevaluable) add('Cycle', 'Déclaré non évaluable');

    return h('div', { class: 'stack stack--sm' },
      h('h3', { class: 'v-cal-sheet__h' }, 'Ce que tu as noté'),
      rows.length
        ? h('dl', { class: 'v-cal-sheet__values' },
          rows.map(([label, value]) => h('div', { class: 'v-cal-sheet__value' }, h('dt', {}, label), h('dd', {}, value))))
        : null,
      entry.notes ? h('div', { class: 'v-cal-sheet__notes' },
        h('h4', { class: 'v-cal-sheet__h' }, 'Notes'),
        h('p', {}, entry.notes)) : null);
  }

  function openFuture(iso) {
    const tags = FUTURE_ORDER.filter((t) => (futureDays[iso] || []).includes(t));
    const label = (predictions && predictions.label) || DEFAULT_LABEL;
    let body;
    if (!showPredictions) {
      let close = () => {};
      body = h('div', { class: 'v-cal-sheet stack' },
        h('p', {}, 'Ce jour n\'est pas encore passé. Les prévisions sont masquées.'),
        h('button', {
          type: 'button', class: 'btn btn--block',
          on: {
            click: () => {
              close();
              toggle.checked = true;
              toggle.dispatchEvent(new Event('change'));
            },
          },
        }, icon('eye', { size: 18 }), 'Afficher les prévisions'));
      close = ctx.ui.openSheet({ title: capitalize(fmtDate(iso, 'complet')), content: body });
      return;
    }
    body = h('div', { class: 'v-cal-sheet stack' },
      h('p', { class: 'eyebrow v-cal-sheet__eyebrow' }, 'Prévision indicative'),
      tags.length
        ? h('ul', { class: 'v-cal-sheet__future stack stack--sm' }, tags.map((t) => h('li', {},
          legendSwatch(t),
          h('div', {},
            h('p', { class: 'v-cal-sheet__decision-title' }, FUTURE_META[t].label),
            h('p', { class: 'muted' }, FUTURE_META[t].detail)))))
        : h('p', {}, 'Aucune prévision pour ce jour.'),
      tags.includes('infertile_post_suite') && protectionForced
        ? decisionBox('protect', 'shield', DECISION_META.protection.label, forcedText())
        : null,
      predictionSummary(),
      h('p', { class: 'v-cal-sheet__label' }, icon('alert', { size: 18 }), h('span', {}, label)),
      h('p', { class: 'muted' }, 'Le statut de ce jour sera calculé à partir de tes observations, le moment venu. ' + REMINDER));
    ctx.ui.openSheet({ title: capitalize(fmtDate(iso, 'complet')), content: body });
  }

  /** Pourquoi la protection reste nécessaire pendant tout le cycle en cours. */
  function forcedText() {
    if (currentCycle?.flags?.learning) return 'Cycle d\'apprentissage : la protection reste nécessaire pendant tout ce cycle.';
    if (currentCycle?.flags?.strictFSRH) return 'Mode strict FSRH : la protection reste nécessaire pendant tout ce cycle.';
    return `${decisionLook(todayStatus).aria}. La protection reste nécessaire pendant ce cycle.`;
  }

  /* ---------------- Prévisions et légende ---------------- */

  /** Résumé factuel : prochaines règles, fourchette, confiance et nombre de cycles. */
  function predictionSummary() {
    if (!predictions) return null;
    const lines = [];
    const np = predictions.nextPeriod;
    if (np && np.date) {
      const range = np.from80 && np.to80 && np.from80 !== np.to80
        ? ` (plutôt entre le ${fmtDate(np.from80, 'court')} et le ${fmtDate(np.to80, 'court')})`
        : '';
      lines.push(`Prochaines règles vers le ${fmtDate(np.date, 'court')}${range}.`);
    }
    if (predictions.message) lines.push(predictions.message);
    if (!lines.length) return null;
    return h('div', { class: 'stack stack--sm' }, lines.map((l) => h('p', {}, l)));
  }

  function drawPredictionNote() {
    if (!showPredictions) {
      predictionNote.replaceChildren(h('p', { class: 'muted' }, 'Prévisions masquées : seuls les jours passés sont affichés.'));
      return;
    }
    predictionNote.replaceChildren(
      predictionSummary() || h('p', { class: 'muted' }, 'Pas encore de prévision.'),
      h('p', { class: 'v-cal-sheet__label' }, icon('alert', { size: 18 }), h('span', {}, (predictions && predictions.label) || DEFAULT_LABEL)));
  }

  /** Échantillon de case pour la légende (même code que la grille). */
  function legendSwatch(kind) {
    const map = {
      protect: ['v-cal__day--protect', 'shield'],
      mixed: ['v-cal__day--mixed', 'mixed'],
      pre: ['v-cal__day--pre', 'check'],
      safe: ['v-cal__day--safe', 'check'],
      none: ['v-cal__day--none', null],
      today: ['v-cal__day--none is-today', null],
      regles_prevues: ['v-cal__day--future', null, 'forecast'],
      fertile_estime: ['v-cal__day--future', 'shield'],
      ovulation_estimee: ['v-cal__day--future', 'star'],
      infertile_post_suite: ['v-cal__day--future v-cal__day--suite', protectionForced ? 'shield' : 'check'],
    };
    const [cls, ic, dawn] = map[kind];
    return h('span', { class: `v-cal__swatch v-cal__day ${cls}`, ariaHidden: 'true' },
      ic ? h('span', { class: ic === 'star' ? 'v-cal__star' : 'v-cal__corner' }, icon(ic, { size: 14 })) : null,
      dawn ? h('span', { class: 'v-cal__dawnwrap' }, h('span', { class: 'dawn-bar dawn-bar--forecast v-cal__dawn' })) : null);
  }

  function legendItem(swatch, text) {
    return h('li', { class: 'v-cal__legend-item' }, swatch, h('span', {}, text));
  }

  function markSwatch(node) {
    return h('span', { class: 'v-cal__swatch v-cal__swatch--mark', ariaHidden: 'true' }, node);
  }

  function legend() {
    return h('section', { class: 'card v-cal__legend stack stack--sm', ariaLabelledby: 'cal-legend-title' },
      h('h2', { class: 'section-title', id: 'cal-legend-title' }, 'Légende'),
      h('h3', { class: 'v-cal__legend-h' }, 'Couleur de la case : la décision du jour'),
      h('ul', { class: 'v-cal__legend-list' },
        legendItem(legendSwatch('protect'),
          'Protection nécessaire : fertile, pas assez de données, ou protection maintenue (cycle d\'apprentissage, mode strict, cycle 0…)'),
        legendItem(legendSwatch('mixed'), 'Protection nécessaire jusqu\'à 18 h, puis pas de protection nécessaire selon les règles (double contrôle)'),
        legendItem(legendSwatch('pre'), `${DECISION_META.libre.label} : début de cycle (règle des 5 jours / moins 8), sauf apparition de glaire`),
        legendItem(legendSwatch('safe'), `${DECISION_META.libre.label} : après le double contrôle, jusqu'aux prochaines règles`),
        legendItem(legendSwatch('none'), 'Jour hors suivi'),
        legendItem(legendSwatch('today'), 'Aujourd\'hui')),
      h('p', { class: 'v-cal__legend-note' }, icon('shield', { size: 16 }),
        h('span', {}, 'Un jour infertile selon les règles reste peint « protection » si la protection est maintenue. Son état est précisé dans le détail du jour.')),
      h('h3', { class: 'v-cal__legend-h' }, 'Repères'),
      h('ul', { class: 'v-cal__legend-list' },
        legendItem(markSwatch(h('span', { class: 'dawn-bar' })), 'Règles (barre « aube » en bas de la case)'),
        legendItem(markSwatch(h('span', { class: 'v-cal__mark--drop' }, icon('drop', { size: 14 }))), 'Spotting ou saignement après le retrait'),
        legendItem(markSwatch(h('span', { class: 'v-cal__dot' })), 'Température notée'),
        legendItem(markSwatch(h('span', { class: 'v-cal__dot v-cal__dot--hollow' })), 'Température exclue'),
        showSex ? legendItem(markSwatch(h('span', { class: 'v-cal__mark--heart' }, icon('heart', { size: 14 }))), 'Rapport noté') : null,
        legendItem(markSwatch(h('span', { class: 'v-cal__txt' }, 'LH+')), 'Test LH positif'),
        legendItem(markSwatch(h('span', { class: 'v-cal__txt v-cal__txt--peak' }, 'P')), 'Sommet de glaire'),
        legendItem(markSwatch(h('span', { class: 'v-cal__txt v-cal__txt--fhm' }, '↑')), 'Première valeur haute de température (FHM)')));
  }

  function legendFutureSection() {
    return h('section', { class: 'card v-cal__legend stack stack--sm', ariaLabelledby: 'cal-legend-future-title' },
      h('h2', { class: 'section-title', id: 'cal-legend-future-title' }, 'Prévisions (indicatives)'),
      h('p', { class: 'v-cal__legend-note' }, icon('forecast', { size: 16 }),
        h('span', {}, 'Bord en pointillés = jour à venir. Une prévision ne remplace jamais la décision du jour.')),
      h('ul', { class: 'v-cal__legend-list' },
        FUTURE_ORDER.map((t) => legendItem(legendSwatch(t), FUTURE_META[t].label))));
  }
}
