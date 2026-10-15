/**
 * Lune — vue « Comprendre » (route 'comprendre', params.article optionnel).
 *
 * - Sans article : recherche, « Pour commencer », fiches par catégorie,
 *   glossaire repliable et numéros utiles.
 * - Avec article : lecture d'une fiche (rendu de chaque type de bloc, §7 du contrat)
 *   puis fiches liées de la même catégorie.
 *
 * Le contenu vient de js/content/* ; tout est construit avec h() (jamais d'innerHTML).
 */

import { h, icon, richText, plural, fmtDate, moonSvg } from '../dom.js'
import { CATEGORIES, ARTICLES, getArticle } from '../../content/articles.js'
import { GLOSSARY, RESOURCES, RESOURCES_CHECKED_AT, TEXTS } from '../../content/tips.js'

/** Fiches mises en avant, dans cet ordre. */
const FEATURED_IDS = ['apres-retrait', 'bien-demarrer', 'methode']

const EVIDENCE_META = {
  solide: { label: 'Preuves solides', level: 3 },
  moyenne: { label: 'Preuves moyennes', level: 2 },
  faible: { label: 'Preuves faibles', level: 1 },
}

const CALLOUT_META = {
  info: { icon: 'info', prefix: 'À savoir : ' },
  attention: { icon: 'alert', prefix: 'Attention : ' },
  urgent: { icon: 'alert', prefix: 'Urgent : ' },
}

/** État conservé entre deux rendus (re-rendu de la coque à 18 h, retour depuis une fiche). */
const memory = { query: '', glossaryOpen: false }

/* ------------------------------------------------------------------ */
/* Données (lecture défensive : le contenu peut être incomplet)        */
/* ------------------------------------------------------------------ */

const asArray = (v) => (Array.isArray(v) ? v : [])
const articles = () => asArray(ARTICLES).filter((a) => a && a.id && a.title)
const categories = () => asArray(CATEGORIES).filter((c) => c && c.id)

function categoryOf(article) {
  return categories().find((c) => c.id === article.category) || { id: article.category || 'autres', label: 'Autres fiches', icon: 'book' }
}

function findArticle(id) {
  try {
    return (typeof getArticle === 'function' ? getArticle(id) : null) || articles().find((a) => a.id === id) || null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

/**
 * Normalise pour la recherche : sans accents, minuscules, apostrophes unifiées, sans « ** ».
 * @param {string} str
 * @returns {string}
 */
export function normalizeSearch(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\*\*/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texte lisible d'un bloc d'article (les sources ne sont pas indexées). */
function blockText(b) {
  if (!b || typeof b !== 'object') return ''
  switch (b.type) {
    case 'list':
    case 'steps':
      return asArray(b.items).join(' ')
    case 'callout':
      return `${b.title || ''} ${b.text || ''}`
    case 'table':
      return [asArray(b.head), ...asArray(b.rows)].flat().join(' ')
    case 'contact':
      return `${b.label || ''} ${b.phone || ''} ${b.detail || ''}`
    case 'sources':
      return ''
    default:
      return b.text || ''
  }
}

const articleIndex = new Map()

function indexOf(article) {
  let idx = articleIndex.get(article)
  if (idx === undefined) {
    idx = normalizeSearch([article.title, article.summary, ...asArray(article.blocks).map(blockText)].join(' '))
    articleIndex.set(article, idx)
  }
  return idx
}

/** Vrai si tous les mots de la requête figurent dans le texte normalisé. */
function matches(haystack, terms) {
  return terms.every((t) => haystack.includes(t))
}

/**
 * Filtre fiches, termes du glossaire et ressources selon une requête.
 * @param {string} query texte saisi
 * @returns {{ articles: object[], glossary: object[], resources: object[] }}
 */
export function searchContent(query) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean)
  if (!terms.length) return { articles: [], glossary: [], resources: [] }
  return {
    articles: articles().filter((a) => matches(indexOf(a), terms)),
    glossary: glossaryEntries().filter((g) => matches(normalizeSearch(`${g.term} ${g.definition}`), terms)),
    resources: asArray(RESOURCES).filter((r) => r && matches(normalizeSearch(`${r.label} ${r.phone || ''} ${r.detail || ''}`), terms)),
  }
}

function glossaryEntries() {
  return asArray(GLOSSARY)
    .filter((g) => g && g.term)
    .slice()
    .sort((a, b) => a.term.localeCompare(b.term, 'fr', { sensitivity: 'base' }))
}

/* ------------------------------------------------------------------ */
/* Petits composants                                                   */
/* ------------------------------------------------------------------ */

function evidenceBadge(evidence) {
  const meta = EVIDENCE_META[evidence]
  if (!meta) return null
  const bars = [1, 2, 3].map((n) => h('span', { class: ['learn-evidence__bar', n <= meta.level && 'is-on'] }))
  return h('span', {
    class: ['badge', 'learn-evidence', `learn-evidence--${evidence}`],
    title: `Niveau de preuve des études citées : ${evidence}`,
  }, h('span', { class: 'learn-evidence__bars', ariaHidden: 'true' }, bars), h('span', {}, meta.label))
}

function readingTime(minutes, long = false) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return h('span', { class: 'learn-meta__time' },
    icon('clock', { size: 16 }),
    h('span', {}, long ? `${minutes} min de lecture` : `${minutes} min`))
}

function externalLink(url, text, cls) {
  return h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' },
    h('span', {}, text),
    icon('external', { size: 14 }),
    h('span', { class: 'sr-only' }, ' (s’ouvre dans un nouvel onglet)'))
}

/** « https://www.exemple.fr/chemin/ » → « exemple.fr/chemin » */
function displayUrl(url) {
  return String(url).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
}

function selectText(el) {
  try {
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  } catch { /* sélection impossible : le numéro reste lisible */ }
}

/**
 * Carte d'une ressource : numéro sélectionnable + copier + appeler, lien externe, détail.
 * Sert aussi au bloc « contact » des articles.
 */
function contactCard(res, ctx) {
  const toast = (msg) => ctx.ui?.toast?.(msg)
  const phone = res.phone ? String(res.phone) : null
  let numberEl = null
  let phoneRow = null
  if (phone) {
    numberEl = h('span', { class: 'mono learn-contact__number' }, phone)
    const copy = () => {
      try {
        navigator.clipboard.writeText(phone)
          .then(() => toast(`Numéro ${phone} copié.`))
          .catch(() => {
            selectText(numberEl)
            toast('Copie impossible : le numéro est sélectionné, copie-le à la main.')
          })
      } catch {
        selectText(numberEl)
        toast('Copie impossible : le numéro est sélectionné, copie-le à la main.')
      }
    }
    phoneRow = h('div', { class: 'learn-contact__phone' },
      numberEl,
      h('div', { class: 'learn-contact__actions' },
        h('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          ariaLabel: `Copier le numéro ${phone}`,
          on: { click: copy },
        }, icon('copy', { size: 18 }), h('span', {}, 'Copier')),
        h('a', {
          class: 'btn btn--ghost btn--sm',
          href: `tel:${phone.replace(/[^\d+]/g, '')}`,
          ariaLabel: `Appeler le ${phone}`,
        }, icon('phone', { size: 18 }), h('span', {}, 'Appeler'))))
  }
  return h('div', { class: 'learn-contact' },
    h('p', { class: 'learn-contact__label' }, res.label),
    phoneRow,
    res.url ? externalLink(res.url, displayUrl(res.url), 'learn-contact__url') : null,
    res.detail ? h('p', { class: 'learn-contact__detail' }, richText(res.detail)) : null)
}

/** Carte cliquable d'un article (lien étiré sur le titre). */
function articleCard(article, ctx, { featured = false, showCategory = false } = {}) {
  const cat = categoryOf(article)
  const open = (e) => {
    e.preventDefault()
    ctx.navigate('comprendre', { article: article.id })
  }
  return h('li', { class: ['learn-card', featured && 'learn-card--featured', catClass(cat)] },
    featured || showCategory
      ? h('span', { class: 'learn-card__cat' }, icon(cat.icon || 'book', { size: 16 }), h('span', {}, cat.label))
      : null,
    h('h3', { class: 'learn-card__title' },
      h('a', { class: 'learn-card__link', href: `#comprendre/${encodeURIComponent(article.id)}`, on: { click: open } }, article.title)),
    article.summary ? h('p', { class: 'learn-card__summary' }, richText(article.summary)) : null,
    h('div', { class: 'learn-meta' }, readingTime(article.readingMinutes), evidenceBadge(article.evidence)),
    h('span', { class: 'learn-card__chevron', ariaHidden: 'true' }, icon('chevron-right', { size: 20 })))
}

function cardList(list, ctx, opts) {
  return h('ul', { class: ['learn-cards', opts?.featured && 'learn-cards--featured'], role: 'list' },
    list.map((a) => articleCard(a, ctx, opts)))
}

function glossaryList(entries) {
  return h('dl', { class: 'learn-glossary__list' },
    entries.map((g) => h('div', { class: 'learn-glossary__item' },
      h('dt', {}, g.term),
      h('dd', {}, richText(g.definition || '')))))
}

/** Classe de couleur d'une catégorie (palette phases / or / indigo, jamais de vert). */
function catClass(cat) {
  return `learn-cat--${String(cat?.id || 'autres').replace(/[^a-z0-9-]/gi, '')}`
}

function sectionHeader(title, iconName, id, count) {
  return h('h2', { class: 'learn-section__title', id },
    iconName ? h('span', { class: 'learn-section__ico', ariaHidden: 'true' }, icon(iconName, { size: 20 })) : null,
    h('span', {}, title),
    count ? h('span', { class: 'learn-section__count mono' }, String(count)) : null)
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

function checkedAtText() {
  // fmtDate 'complet' → « dimanche 4 octobre 2026 » ; on retire le jour de la semaine.
  const full = fmtDate(RESOURCES_CHECKED_AT, 'complet')
  return full === '—' ? null : `Coordonnées vérifiées le ${full.split(' ').slice(1).join(' ')}. Horaires et numéros peuvent changer.`
}

function resourcesSection(ctx) {
  const list = asArray(RESOURCES).filter((r) => r && r.label)
  if (!list.length) return null
  // Numéros d'urgence courts (15, 112, 3114…) en premier, puis lignes d'écoute, puis sites.
  const isShort = (r) => r.phone && String(r.phone).replace(/\D/g, '').length <= 4
  const urgent = list.filter(isShort)
  const phones = list.filter((r) => r.phone && !isShort(r))
  const others = list.filter((r) => !r.phone)
  const group = (title, items) => (items.length
    ? h('div', { class: 'learn-resources__group' },
      h('h3', { class: 'eyebrow' }, title),
      h('ul', { class: 'learn-contacts', role: 'list' }, items.map((r) => h('li', {}, contactCard(r, ctx)))))
    : null)
  const checked = checkedAtText()
  return h('section', { class: 'learn-section', ariaLabelledby: 'learn-resources-title' },
    sectionHeader('Numéros utiles', 'phone', 'learn-resources-title'),
    group('Urgences', urgent),
    group('Écoute et information', phones),
    group('Sites et lieux', others),
    checked ? h('p', { class: 'hint learn-resources__checked' }, icon('check', { size: 16 }), h('span', {}, checked)) : null)
}

function glossarySection() {
  const entries = glossaryEntries()
  if (!entries.length) return null
  const details = h('details', {
    class: 'learn-glossary',
    open: memory.glossaryOpen,
    on: { toggle: () => { memory.glossaryOpen = details.open } },
  },
  h('summary', { class: 'learn-glossary__summary' },
    h('span', {}, `Voir les ${entries.length} ${plural(entries.length, 'terme')}`),
    icon('chevron-down', { size: 20 })),
  glossaryList(entries))
  return h('section', { class: 'learn-section', ariaLabelledby: 'learn-glossary-title' },
    sectionHeader('Glossaire', 'book', 'learn-glossary-title'),
    details)
}

/** En-tête « Pour commencer » : un petit ciel de la phase en cours (texte dans le haut du ciel). */
function featuredHeader(n) {
  return h('header', { class: 'sky learn-hero' },
    h('span', { class: 'learn-hero__stars', ariaHidden: 'true' }),
    h('span', { class: 'learn-hero__moon' }, moonSvg(10, 28, { size: 64, label: null })),
    h('div', { class: 'learn-hero__text' },
      h('p', { class: 'learn-hero__eyebrow' }, `${n} ${plural(n, 'fiche')} pour bien démarrer`),
      h('h2', { class: 'learn-hero__title', id: 'learn-featured-title' }, 'Pour commencer')),
    h('span', { class: 'learn-hero__horizon', ariaHidden: 'true' }))
}

function defaultSections(ctx) {
  const all = articles()
  const nodes = []
  const featured = FEATURED_IDS.map((id) => all.find((a) => a.id === id)).filter(Boolean)
  if (featured.length) {
    nodes.push(h('section', { class: 'learn-section learn-section--featured', ariaLabelledby: 'learn-featured-title' },
      featuredHeader(featured.length),
      cardList(featured, ctx, { featured: true })))
  }
  // Catégories du contrat, puis catégories inconnues éventuelles (« Autres fiches »).
  const groups = new Map(categories().map((c) => [c.id, { cat: c, items: [] }]))
  for (const a of all) {
    const cat = categoryOf(a)
    if (!groups.has(cat.id)) groups.set(cat.id, { cat, items: [] })
    groups.get(cat.id).items.push(a)
  }
  for (const { cat, items } of groups.values()) {
    if (!items.length) continue
    const titleId = `learn-cat-${cat.id}`
    nodes.push(h('section', { class: ['learn-section', catClass(cat)], ariaLabelledby: titleId },
      sectionHeader(cat.label, cat.icon, titleId, items.length),
      cardList(items, ctx)))
  }
  if (!all.length) {
    nodes.push(h('div', { class: 'empty' }, icon('book', { size: 28 }), h('p', {}, 'Les fiches arrivent bientôt.')))
  }
  nodes.push(glossarySection(), resourcesSection(ctx))
  return nodes.filter(Boolean)
}

function resultSections(query, ctx) {
  const res = searchContent(query)
  const total = res.articles.length + res.glossary.length + res.resources.length
  if (!total) {
    return [h('div', { class: 'empty' },
      icon('book', { size: 28 }),
      h('p', {}, `Rien ne correspond à « ${query.trim()} ».`),
      h('p', { class: 'hint' }, 'Essaie un mot plus court ou un synonyme : « glaire », « température », « règles »…'))]
  }
  const nodes = []
  if (res.articles.length) {
    nodes.push(h('section', { class: 'learn-section', ariaLabelledby: 'learn-res-articles' },
      sectionHeader(plural(res.articles.length, 'Fiche'), 'book', 'learn-res-articles', res.articles.length),
      cardList(res.articles, ctx, { showCategory: true })))
  }
  if (res.glossary.length) {
    nodes.push(h('section', { class: 'learn-section', ariaLabelledby: 'learn-res-glossary' },
      sectionHeader('Glossaire', 'book', 'learn-res-glossary', res.glossary.length),
      h('div', { class: 'learn-glossary learn-glossary--results' }, glossaryList(res.glossary))))
  }
  if (res.resources.length) {
    nodes.push(h('section', { class: 'learn-section', ariaLabelledby: 'learn-res-resources' },
      sectionHeader('Numéros utiles', 'phone', 'learn-res-resources', res.resources.length),
      h('ul', { class: 'learn-contacts', role: 'list' }, res.resources.map((r) => h('li', {}, contactCard(r, ctx))))))
  }
  return nodes
}

function resultsSummary(query) {
  if (!normalizeSearch(query)) return ''
  const res = searchContent(query)
  const parts = []
  if (res.articles.length) parts.push(`${res.articles.length} ${plural(res.articles.length, 'fiche')}`)
  if (res.glossary.length) parts.push(`${res.glossary.length} ${plural(res.glossary.length, 'terme')} du glossaire`)
  if (res.resources.length) parts.push(`${res.resources.length} ${plural(res.resources.length, 'ressource')}`)
  return parts.length ? `Résultats : ${parts.join(', ')}.` : 'Aucun résultat.'
}

function renderList(root, ctx) {
  const results = h('div', { class: 'learn-results stack stack--lg' })
  const status = h('p', { class: 'sr-only', role: 'status', ariaLive: 'polite' })

  const clearBtn = h('button', {
    type: 'button',
    class: 'iconbtn learn-search__clear',
    ariaLabel: 'Effacer la recherche',
    on: { click: () => { input.value = ''; update(); input.focus() } },
  }, icon('x', { size: 20 }))

  const input = h('input', {
    type: 'search',
    id: 'learn-search',
    class: 'input learn-search__input',
    value: memory.query,
    placeholder: 'Glaire, test de grossesse, DIU…',
    attrs: { autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' },
    on: {
      input: () => update(),
      keydown: (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; update() } },
    },
  })

  function update() {
    memory.query = input.value
    const searching = normalizeSearch(input.value) !== ''
    clearBtn.hidden = !searching
    results.replaceChildren(...(searching ? resultSections(input.value, ctx) : defaultSections(ctx)))
    status.textContent = resultsSummary(input.value)
  }

  root.append(h('div', { class: 'v-learn stack stack--lg' },
    h('header', { class: 'learn-head stack stack--sm' },
      h('h1', {}, 'Comprendre'),
      h('p', { class: 'muted' }, 'Des fiches courtes et sourcées sur ton cycle, la méthode et ta santé.')),
    h('form', {
      class: 'learn-search field',
      role: 'search',
      on: { submit: (e) => { e.preventDefault(); input.blur() } },
    },
    h('label', { class: 'label', htmlFor: 'learn-search' }, 'Rechercher dans les fiches'),
    h('div', { class: 'learn-search__box' }, input, clearBtn)),
    status,
    results,
    TEXTS?.disclaimerShort ? h('p', { class: 'hint learn-foot' }, richText(TEXTS.disclaimerShort)) : null))

  update()
}

/* ------------------------------------------------------------------ */
/* Lecture d'un article                                                */
/* ------------------------------------------------------------------ */

function renderBlock(b, ctx) {
  if (!b || typeof b !== 'object') return null
  switch (b.type) {
    case 'p':
      return h('p', {}, richText(b.text))
    case 'h':
      return h('h2', { class: 'learn-prose__h' }, richText(b.text))
    case 'list':
      return h('ul', { class: 'learn-prose__list' }, asArray(b.items).map((t) => h('li', {}, richText(t))))
    case 'steps':
      return h('ol', { class: 'learn-steps' }, asArray(b.items).map((t) => h('li', {}, h('span', {}, richText(t)))))
    case 'callout': {
      const tone = CALLOUT_META[b.tone] ? b.tone : 'info'
      const meta = CALLOUT_META[tone]
      return h('aside', { class: ['alert', `alert--${tone}`, 'learn-callout'] },
        icon(meta.icon, { size: 20 }),
        h('div', { class: 'stack stack--sm' },
          b.title ? h('p', { class: 'alert__title' }, h('span', { class: 'sr-only' }, meta.prefix), richText(b.title)) : null,
          b.text ? h('p', {}, b.title ? null : h('span', { class: 'sr-only' }, meta.prefix), richText(b.text)) : null))
    }
    case 'table': {
      const head = asArray(b.head)
      return h('div', {
        class: 'learn-table',
        role: 'region',
        tabIndex: 0,
        ariaLabel: head.length ? `Tableau : ${head.join(', ')}` : 'Tableau',
      },
      h('table', {},
        head.length ? h('thead', {}, h('tr', {}, head.map((c) => h('th', { scope: 'col' }, richText(c))))) : null,
        h('tbody', {}, asArray(b.rows).map((row) => h('tr', {}, asArray(row).map((c) => h('td', {}, richText(c))))))))
    }
    case 'contact':
      return b.label ? contactCard(b, ctx) : null
    case 'sources': {
      const items = asArray(b.items).filter((s) => s && s.url)
      if (!items.length) return null
      return h('section', { class: 'learn-sources', ariaLabel: 'Sources' },
        h('h2', { class: 'learn-sources__title' }, 'Sources'),
        h('ol', {}, items.map((s) => h('li', {}, externalLink(s.url, s.label || displayUrl(s.url), 'learn-sources__link')))))
    }
    default:
      return null
  }
}

function backButton(ctx, label = 'Toutes les fiches') {
  return h('button', {
    type: 'button',
    class: 'btn btn--ghost btn--sm learn-back',
    on: { click: () => ctx.navigate('comprendre') },
  }, icon('chevron-left', { size: 18 }), h('span', {}, label))
}

function renderArticle(root, ctx, id) {
  try { window.scrollTo(0, 0) } catch { /* rien */ }
  const article = findArticle(id)
  if (!article) {
    root.append(h('div', { class: 'v-learn stack stack--lg' },
      h('div', {}, backButton(ctx)),
      h('div', { class: 'empty' },
        icon('book', { size: 28 }),
        h('h1', { class: 'section-title' }, 'Fiche introuvable'),
        h('p', {}, 'Cette fiche n’existe pas ou a été renommée. Retrouve toutes les fiches dans la liste.'))))
    return
  }

  const cat = categoryOf(article)
  const related = articles().filter((a) => a.id !== article.id && categoryOf(a).id === cat.id)

  root.append(h('div', { class: 'v-learn stack stack--lg' },
    h('div', {}, backButton(ctx)),
    h('article', { class: 'learn-article', ariaLabelledby: 'learn-article-title' },
      h('header', { class: ['learn-article__head', 'stack', 'stack--sm', catClass(cat)] },
        h('p', { class: 'eyebrow learn-article__cat' }, icon(cat.icon || 'book', { size: 16 }), h('span', {}, cat.label)),
        h('h1', { id: 'learn-article-title', class: 'learn-article__title' }, article.title),
        h('div', { class: 'learn-meta' }, readingTime(article.readingMinutes, true), evidenceBadge(article.evidence)),
        article.summary ? h('p', { class: 'learn-article__lead' }, richText(article.summary)) : null),
      h('div', { class: 'learn-prose' }, asArray(article.blocks).map((b) => renderBlock(b, ctx)))),
    related.length
      ? h('section', { class: ['learn-section', 'learn-related', catClass(cat)], ariaLabelledby: 'learn-related-title' },
        sectionHeader(`Dans « ${cat.label} »`, cat.icon, 'learn-related-title'),
        cardList(related, ctx))
      : null,
    h('div', {}, backButton(ctx, 'Revenir à toutes les fiches'))))
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

/**
 * Affiche la vue « Comprendre » : la liste des fiches, ou une fiche si `ctx.route.params.article`.
 * @param {HTMLElement} root conteneur déjà vidé
 * @param {object} ctx contexte des vues (contrat §6.1)
 */
export function render(root, ctx) {
  const id = ctx?.route?.params?.article
  if (id) renderArticle(root, ctx, id)
  else renderList(root, ctx)
}
