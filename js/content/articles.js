/**
 * Articles éducatifs de « Lune » (rubrique Comprendre).
 * Contenu fondé exclusivement sur docs/spec-medicale.md (v1.0 du 2026-10-04).
 * Chaînes : **gras** seulement (rendu via richText), aucune balise HTML.
 */

import { TEXTS, RESOURCES, RESOURCES_CHECKED_AT } from './tips.js'

export const CATEGORIES = [
  { id: 'demarrer', label: 'Bien démarrer', icon: 'sparkle' },
  { id: 'methode', label: 'La méthode', icon: 'thermo' },
  { id: 'corps', label: 'Ton cycle', icon: 'moon' },
  { id: 'sante', label: 'Santé', icon: 'heart' },
  { id: 'contraception', label: 'Contraception', icon: 'shield' },
  { id: 'ressources', label: 'Ressources', icon: 'phone' },
]

/* ---------- Sources (URL reprises de la spec) ---------- */

const S = {
  sensiplanFaq: { label: 'Sensiplan, FAQ', url: 'https://www.sensiplan.de/faqs' },
  sensiplanApp: { label: 'Sensiplan, page de l’application officielle', url: 'https://www.sensiplan.de/produkte/sensiplan-app' },
  sensiplanAbout: { label: 'Sensiplan, à propos de la méthode', url: 'https://www.sensiplan.de/ueber-sensiplan' },
  sensiplanBook: { label: 'Sensiplan, manuel « Natürlich & sicher – Das Praxisbuch »', url: 'https://www.sensiplan.de/produkte/natuerlich-und-sicher-das-praxisbuch' },
  s2k: { label: 'Recommandation allemande S2k AWMF 015-095 (2024)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11303010/' },
  frank2007: { label: 'Frank-Herrmann et al. 2007, étude de cohorte Sensiplan', url: 'https://pubmed.ncbi.nlm.nih.gov/17314078/' },
  ct22: { label: 'Contraceptive Technology, 22e éd. (2023), chapitre 5', url: 'https://samples.jblearning.com/9781284255034/9781284255058_CH05_Kowal_Secured.pdf' },
  guttmacher: { label: 'Guttmacher Institute, synthèse sur l’efficacité contraceptive (2025)', url: 'https://www.guttmacher.org/article/2025/10/contraceptive-effectiveness-synthesis-literature' },
  fdaNC: { label: 'FDA, dossier De Novo DEN170052 (Natural Cycles)', url: 'https://www.accessdata.fda.gov/cdrh_docs/reviews/DEN170052.pdf' },
  fsrhFam: { label: 'FSRH 2015, méthodes d’observation de la fertilité (document historique, archivé)', url: 'https://web.archive.org/web/20240902205355/https://www.fsrh.org/Common/Uploaded%20files/documents/ceuguidancefertilityawarenessmethods.pdf' },
  who: { label: 'OMS, manuel mondial de planification familiale (2022)', url: 'https://fphandbook.org/sites/default/files/WHO-JHU-FPHandbook-2022Ed-v221114.pdf' },
  spf: { label: 'Santé publique France, les méthodes naturelles', url: 'https://www.questionsexualite.fr/choisir-sa-contraception/tous-les-modes-de-contraception/que-sont-les-methodes-naturelles' },
  loesung: { label: 'AG NFP, Lösungsheft Sensiplan 2018 (archivé)', url: 'https://web.archive.org/web/2025/https://www.sensiplan.de/storage/media/documents/46/sensiplan-loesungsheft-web.pdf' },
  feuille: { label: 'Feuille de cycle Sensiplan en français (archivée)', url: 'https://web.archive.org/web/2025/https://www.sensiplan.de/storage/media/documents/36/1511-0021-zyklusblatt-franzoesisch-03.pdf' },
  mynfpTemp: { label: 'myNFP, évaluer la température', url: 'https://mynfp.de/temperatur-auswerten' },
  mynfpGlaire: { label: 'myNFP, observer la glaire', url: 'https://mynfp.de/zervixschleim-beobachten' },
  mynfpCombi: { label: 'myNFP, combiner température et glaire', url: 'https://mynfp.de/temperatur-und-zervixschleim-kombinieren' },
  mynfpDebut: { label: 'myNFP, infertilité en début de cycle', url: 'https://mynfp.de/unfruchtbarkeit-am-zyklusanfang' },
  mynfpPost: { label: 'myNFP, après une contraception hormonale', url: 'https://mynfp.de/post-pill' },
  mynfpCol: { label: 'myNFP, observer le col', url: 'https://mynfp.de/muttermund-beobachten' },
  mynfpLh: { label: 'myNFP, tests d’ovulation', url: 'https://mynfp.de/ovulationstests' },
  mynfpFaq: { label: 'myNFP, FAQ', url: 'https://mynfp.de/faq' },
  baur: { label: 'Baur 2010 (cite Gnoth 1996), Imago Hominis', url: 'https://www.imabe.org/fileadmin/imago_hominis/pdf/IH017_275-289.pdf' },
  bull: { label: 'Bull et al. 2019, 612 613 cycles, npj Digital Medicine', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6710244/' },
  fehring: { label: 'Fehring et al. 2006, variabilité des phases du cycle', url: 'https://pubmed.ncbi.nlm.nih.gov/16700687/' },
  apple: { label: 'Étude Apple Women’s Health 2023, longueur des cycles', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10226714/' },
  wilcox1995: { label: 'Wilcox et al. 1995, NEJM', url: 'https://pubmed.ncbi.nlm.nih.gov/7477165/' },
  wilcox2000: { label: 'Wilcox et al. 2000, BMJ', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC27529/' },
  johnson: { label: 'Johnson et al. 2018, précision des applis calendrier', url: 'https://pubmed.ncbi.nlm.nih.gov/29749274/' },
  who1980: { label: 'OMS 1980, chronologie du pic de LH', url: 'https://pubmed.ncbi.nlm.nih.gov/6775535/' },
  figo: { label: 'FIGO 2018 (Munro et al.), paramètres normaux du cycle', url: 'https://www.pure.ed.ac.uk/ws/files/75445783/Munro_et_al_2018_International_Journal_of_Gynecology_26_Obstetrics.pdf' },
  sopk2023: { label: 'Recommandation internationale SOPK 2023', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10477934/' },
  testDe: { label: 'Stiftung Warentest, applis de cycle', url: 'https://www.test.de/Zyklus-Apps-im-Test-5254377-0/' },
  duane: { label: 'Duane et al. 2016, J Am Board Fam Med', url: 'https://www.jabfm.org/content/29/4/508' },
  zwingerman: { label: 'Zwingerman et al. 2020', url: 'https://pubmed.ncbi.nlm.nih.gov/31882289/' },
  fsrhIuc: { label: 'FSRH/CoSRH 2023, contraception intra-utérine', url: 'https://cosrh.org/Common/Uploaded%20files/documents/fsrh-clinical-guideline-intrauterine-contraception-mar-23-amended.pdf' },
  fsrhEc: { label: 'FSRH, contraception d’urgence (amendée)', url: 'https://cosrh.org/Common/Uploaded%20files/documents/fsrh-guideline-emergency-contraception03dec2020-amendedjuly2023-11jul.pdf' },
  nhsIud: { label: 'NHS, pose et retrait du DIU au cuivre', url: 'https://www.nhs.uk/contraception/methods-of-contraception/iud-coil/getting-it-fitted-or-removed/' },
  nhsIus: { label: 'NHS, pose et retrait du DIU hormonal', url: 'https://www.nhs.uk/contraception/methods-of-contraception/ius-hormonal-coil/getting-it-fitted-or-removed/' },
  rcpMirena: { label: 'ANSM, RCP Mirena', url: 'https://base-donnees-publique.medicaments.gouv.fr/medicament/66349230/extrait' },
  mirenaFda: { label: 'Notice FDA Mirena', url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=dcbd6aa2-b3fa-479a-a676-56ea742962fc' },
  access: { label: 'Étude ACCESS IUS (retour des règles)', url: 'https://clinicaltrials.gov/study/NCT00995150' },
  yland: { label: 'Yland et al. 2020, BMJ', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7656314/' },
  apter: { label: 'Apter et al. 2014, ovulation sous DIU au lévonorgestrel', url: 'https://pubmed.ncbi.nlm.nih.gov/24726226/' },
  nilsson: { label: 'Nilsson et al. 1984', url: 'https://pubmed.ncbi.nlm.nih.gov/6420203/' },
  whoSwitch: { label: 'OMS, passer du DIU à une autre méthode', url: 'https://fphandbook.org/switching-iud-another-method-0' },
  asrm2024: { label: 'ASRM 2024, aménorrhée', url: 'https://pubmed.ncbi.nlm.nih.gov/38456861/' },
  endotext: { label: 'Endotext, le cycle menstruel normal', url: 'https://endotext.org/wp-content/uploads/pdfs/the-normal-menstrual-cycle-and-the-control-of-ovulation.pdf' },
  asrm2021: { label: 'ASRM 2021, optimiser la fertilité naturelle', url: 'https://www.asrm.org/practice-guidance/practice-committee-documents/optimizing-natural-fertility-a-committee-opinion-2021' },
  nhsHeavy: { label: 'NHS, règles abondantes', url: 'https://www.nhs.uk/conditions/heavy-periods/' },
  nhsPms: { label: 'NHS, syndrome prémenstruel', url: 'https://www.nhs.uk/conditions/pre-menstrual-syndrome/' },
  nhsOvPain: { label: 'NHS, douleur d’ovulation', url: 'https://www.nhs.uk/conditions/ovulation-pain/' },
  nhsAfter: { label: 'NHS, grossesse juste après les règles', url: 'https://www.nhs.uk/common-health-questions/pregnancy/can-i-get-pregnant-just-after-my-period-has-finished/' },
  acogPms: { label: 'ACOG 2023, SPM et TDPM (résumé secondaire)', url: 'https://www.obgproject.com/2023/12/27/acog-guideline-management-of-premenstrual-syndrome-and-premenstrual-dysphoric-disorder/' },
  acog760: { label: 'ACOG, avis n° 760 (dysménorrhée)', url: 'https://pubmed.ncbi.nlm.nih.gov/30461694/' },
  cochraneNsaid: { label: 'Cochrane 2015, AINS et règles douloureuses', url: 'https://pubmed.ncbi.nlm.nih.gov/26224322/' },
  cochraneExercise: { label: 'Cochrane, activité physique et règles douloureuses', url: 'https://www.cochrane.org/evidence/CD004142-exercise-dysmenorrhoea' },
  cochraneTens: { label: 'Cochrane, TENS et règles douloureuses', url: 'https://www.cochrane.org/evidence/CD002123_transcutaneous-electrical-nerve-stimulation-primary-dysmenorrhoea' },
  chaleur: { label: 'Méta-analyse 2018, chaleur et règles douloureuses', url: 'https://www.nature.com/articles/s41598-018-34303-z' },
  tabac: { label: 'Tabac et règles douloureuses (méta-analyse)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7159229/' },
  whoEndo: { label: 'OMS, endométriose', url: 'https://www.who.int/news-room/fact-sheets/detail/endometriosis' },
  hasEndo: { label: 'HAS/CNGOF 2017, prise en charge de l’endométriose', url: 'https://www.has-sante.fr/upload/docs/application/pdf/2018-01/prise_en_charge_de_lendometriose_-_recommandations.pdf' },
  ameliEndo: { label: 'Ameli, endométriose', url: 'https://www.ameli.fr/assure/sante/themes/endometriose/symptomes-diagnostic-evolution' },
  nhsPcos: { label: 'NHS, SOPK', url: 'https://www.nhs.uk/conditions/polycystic-ovary-syndrome-pcos/symptoms/' },
  ansesFer: { label: 'ANSES 2021, repères nutritionnels', url: 'https://www.anses.fr/system/files/NUT2018SA0238Ra.pdf' },
  ansesFerInfo: { label: 'ANSES, tout savoir sur le fer', url: 'https://www.anses.fr/fr/content/tout-savoir-sur-le-fer' },
  ameliSaign: { label: 'Ameli, règles très abondantes ou longues', url: 'https://www.ameli.fr/assure/sante/themes/saignements-gynecologiques-anormaux/saignements-entre-les-regles-ou-regles-tres-abondantes-longues-le-bilan' },
  nice: { label: 'NICE NG88, règles abondantes', url: 'https://www.nice.org.uk/guidance/ng88' },
  ansesSct: { label: 'ANSES 2022, avis sur le choc toxique menstruel', url: 'https://www.anses.fr/fr/system/files/CONSO2022SA0106.pdf' },
  santeSct: { label: 'Sante.fr, choc toxique menstruel', url: 'https://www.sante.fr/node/7005479' },
  alcool: { label: 'Alcool et SPM, méta-analyse, BMJ Open 2018', url: 'https://bmjopen.bmj.com/content/8/3/e019490' },
  sport: { label: 'Colenso-Semple et al. 2023, cycle et force', url: 'https://www.frontiersin.org/articles/10.3389/fspor.2023.1054542' },
  synchro: { label: 'Yang et Schank 2006, synchronisation des cycles', url: 'https://doi.org/10.1007/s12110-006-1005-z' },
  endocrine: { label: 'Endocrine Society 2017, aménorrhée hypothalamique', url: 'https://www.endocrine.org/clinical-practice-guidelines/hypothalamic-amenorrhea' },
  ellaone: { label: 'RCP ellaOne (ulipristal)', url: 'https://www.ema.europa.eu/fr/documents/product-information/ellaone-epar-product-information_fr.pdf' },
  ameliGeu: { label: 'Ameli, grossesse extra-utérine', url: 'https://www.ameli.fr/assure/sante/devenir-parent/grossesse/difficultes-et-maladies-pendant-la-grossesse/grossesse-extra-uterine' },
  nhsGeu: { label: 'NHS, grossesse extra-utérine', url: 'https://www.nhs.uk/conditions/ectopic-pregnancy/symptoms/' },
  nhsBleeding: { label: 'NHS, saignements entre les règles ou après un rapport', url: 'https://www.nhs.uk/symptoms/vaginal-bleeding-between-periods-or-after-sex/' },
  ameliAmenorrhee: { label: 'Ameli, absence de règles', url: 'https://www.ameli.fr/assure/sante/themes/retard-absence-de-regles-ou-amenorrhee/amenorrhee-regles-retard-absence' },
  tpe: { label: 'Sante.fr, traitement post-exposition', url: 'https://www.sante.fr/node/88575' },
  cdcCondom: { label: 'CDC, utiliser un préservatif externe', url: 'https://www.cdc.gov/condom-use/resources/external.html' },
  santeCondom: { label: 'Sante.fr, le préservatif', url: 'https://www.sante.fr/node/1253262' },
  fc2: { label: 'Notice du préservatif interne FC2', url: 'https://pathfinder.org/wp-content/uploads/2024/05/FC2-How-to-Use-FC2-Leaflet.pdf' },
  condomSize: { label: 'Condomerie, choisir sa largeur nominale', url: 'https://condomerie.com/en/condoms/nominal-width/which-nominal-width-is-right-for-me' },
  ameliContra: { label: 'Ameli, contraception et remboursements', url: 'https://www.ameli.fr/assure/remboursements/rembourse/contraception-ivg/contraception' },
  vidalCondom: { label: 'Vidal, préservatifs pris en charge avant 26 ans (2026)', url: 'https://www.vidal.fr/actualites/37497-preservatifs-pris-en-charge-a-100-chez-les-moins-de-26-ans-precision-sur-le-nombre-a-delivrer.html' },
  monTestIst: { label: 'Ordre des pharmaciens, « Mon test IST »', url: 'https://www.ordre.pharmacien.fr/les-communications/focus-sur/les-actualites/mon-test-ist-depistage-gratuit-en-laboratoire-de-biologie-medicale-et-sans-ordonnance' },
  hasCu: { label: 'HAS, fiche contraception d’urgence', url: 'https://has-sante.fr/upload/docs/application/pdf/2013-04/fiche-contraception-urgence.pdf' },
  spCu: { label: 'Service-public.fr, contraception d’urgence (F1100)', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1100' },
  ameliCu: { label: 'Ameli, contraception d’urgence gratuite', url: 'https://www.ameli.fr/assure/sante/themes/contraception-urgence/contraception-urgence-gratuite' },
  ameliCuReflexes: { label: 'Ameli, les bons réflexes après une contraception d’urgence', url: 'https://www.ameli.fr/assure/sante/themes/contraception-urgence/bons-reflexes-contraception-urgence' },
  emaPoids: { label: 'EMA 2014, contraceptifs d’urgence et poids', url: 'https://www.ema.europa.eu/en/medicines/human/referrals/emergency-contraceptives' },
  nhsTest: { label: 'NHS, faire un test de grossesse', url: 'https://www.nhs.uk/pregnancy/trying-for-a-baby/doing-a-pregnancy-test/' },
  cole: { label: 'AAFP 2004, sensibilité des tests de grossesse (Cole)', url: 'https://www.aafp.org/pubs/afp/issues/2004/1001/p1370.html' },
  ivg: { label: 'Service-public.fr, IVG (F1551)', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1551' },
  ivgGouv: { label: 'Site officiel IVG', url: 'https://ivg.gouv.fr' },
  webkitStorage: { label: 'WebKit, règles de stockage', url: 'https://webkit.org/blog/14403/updates-to-storage-policy/' },
}

/* ---------- Aides ---------- */

const p = (text) => ({ type: 'p', text })
const hd = (text) => ({ type: 'h', text })
const list = (...items) => ({ type: 'list', items })
const steps = (...items) => ({ type: 'steps', items })
const callout = (tone, title, text) => ({ type: 'callout', tone, title, text })
const table = (head, rows) => ({ type: 'table', head, rows })
const sources = (...items) => ({ type: 'sources', items })

/** Bloc contact construit à partir d'une ressource de tips.js (repérée par son libellé). */
function contact(label) {
  const r = RESOURCES.find((x) => x.label === label)
  if (!r) throw new Error(`Ressource inconnue : ${label}`)
  const block = { type: 'contact', label: r.label, detail: r.detail }
  if (r.phone) block.phone = r.phone
  if (r.url) block.url = r.url
  return block
}

/** Texte lisible d'un bloc (pour estimer le temps de lecture). */
function blockText(b) {
  switch (b.type) {
    case 'list':
    case 'steps':
      return b.items.join(' ')
    case 'callout':
      return `${b.title} ${b.text}`
    case 'table':
      return [b.head, ...b.rows].flat().join(' ')
    case 'contact':
      return `${b.label} ${b.detail || ''}`
    case 'sources':
      return ''
    default:
      return b.text
  }
}

/** Ajoute readingMinutes (≈ 200 mots par minute, minimum 1). */
function article(a) {
  const words = a.blocks.map(blockText).join(' ').split(/\s+/).filter(Boolean).length
  return { ...a, readingMinutes: Math.max(1, Math.round(words / 200)) }
}

const URGENT_15 = 'Appelle le **15** ou le **112**.'

/* ---------- Articles ---------- */

export const ARTICLES = [
  /* ===== Bien démarrer ===== */
  article({
    id: 'apres-retrait',
    category: 'demarrer',
    title: 'Après le retrait de ton stérilet',
    summary: 'Ce qui change dès le retrait, selon que ton DIU était au cuivre ou hormonal, et quand faire un test.',
    evidence: 'moyenne',
    blocks: [
      callout('attention', 'Fertile dès le retrait', 'Ta fertilité revient **immédiatement**. Une grossesse est possible dès le jour du retrait, sans période de transition. Lune affiche donc « Protection nécessaire » dès ce jour-là.'),
      p('Dans une grande étude (Yland, BMJ 2020), environ **1 femme sur 4 ou 5** a conçu dès le premier cycle d’essai après un DIU : 25,8 % après un DIU hormonal, 21,6 % après un DIU au cuivre, contre 29,5 % après une méthode barrière. Ce chiffre vaut pour un cycle entier de rapports non protégés, pas pour un rapport isolé.'),
      hd('À retenir'),
      list(...TEXTS.removalCommon),
      hd('Les 7 jours avant le retrait'),
      p(TEXTS.why7days),
      list(
        '**Aucun rapport non protégé depuis 7 jours** (par exemple, pour un retrait le 15 du mois : depuis le 8 à 0 h) : il suffit de te protéger dès le retrait.',
        '**Un rapport sans préservatif, ou un incident de préservatif**, dans cette fenêtre : **dis-le à la professionnelle AVANT le retrait.**',
      ),
      p('Elle peut te proposer :'),
      list(
        '**de reporter le retrait** jusqu’à avoir 7 jours sans rapport non protégé. C’est la première option. Pour un rapport le 28 ou le 29 septembre, 1 à 2 jours de report suffisent à supprimer le risque ;',
        '**une contraception d’urgence orale** si le rapport date de 5 jours au plus : lévonorgestrel jusqu’à 72 h, ulipristal jusqu’à 120 h. Après un DIU hormonal, l’ulipristal pourrait être moins efficace, à cause du progestatif encore présent : le lévonorgestrel ou le DIU au cuivre peuvent être préférés, à voir avec elle ;',
        '**la pose d’un DIU au cuivre**, la contraception d’urgence la plus efficace, selon les délais ;',
        'dans tous les cas où le risque n’est pas supprimé : **un test de grossesse 21 jours après le dernier rapport non protégé**. Lune te le rappelle.',
      ),
      callout('attention', 'Rapport il y a 6 ou 7 jours', 'Une pilule d’urgence ne le couvre plus. Ne prends pas de pilule au hasard : parles-en avant le retrait.'),
      p('Certaines notices dispensent de cette règle un retrait fait entre le 1er et le 7e jour d’un cycle régulier. Lune ne retient pas cette exception : la recommandation britannique (FSRH) n’en fait aucune, et sous DIU hormonal les saignements ne reflètent pas le vrai cycle.'),
      hd('Commence les mesures tout de suite'),
      p('Pour repérer une montée de température, il faut d’abord **6 valeurs basses** (l’idéal : 8 ou 9). Mesure dès le matin du retrait, et même avant si tu peux : les mesures prises avant le retrait comptent comme valeurs basses. Une ovulation qui tomberait dans les tout premiers jours de mesure ne pourrait pas être évaluée.'),
      hd('Le saignement juste après le retrait'),
      list(
        'Note-le comme **« saignement post-retrait »**. Il ne compte jamais comme le début d’un cycle (J1).',
        'Il gêne l’observation de la glaire : ces jours restent fertiles.',
        'Douleur, saignement ou malaise sont possibles au moment du retrait. Sa durée habituelle (souvent quelques jours) n’est pas chiffrée dans les sources.',
        'Si on t’indique que le DIU n’était pas intact (bras, gaine ou cuivre manquant), un suivi médical est nécessaire.',
      ),
      hd('Si ton DIU était au cuivre'),
      list(...TEXTS.removalCopper),
      hd('Si ton DIU était hormonal'),
      p('Mirena, Kyleena, Jaydess ou Donasert : ils contiennent du lévonorgestrel, un progestatif.'),
      list(...TEXTS.removalHormonal),
      callout('info', 'Tu ne connais pas le type ?', 'La carte patiente, dans la boîte du DIU, indique le modèle et la date de pose. Tu peux aussi demander à la professionnelle le jour du retrait. Sans réponse, Lune applique par prudence les règles prévues pour un DIU hormonal.'),
      hd('Quand faire un test, quand consulter'),
      table(
        ['Situation', 'Que faire'],
        [
          ['Rapport non protégé dans les 7 jours avant le retrait, risque non supprimé', 'Test 21 jours après le dernier rapport non protégé'],
          ['Rapport non protégé ou incident après le retrait, un jour qui n’est pas infertile', 'Contraception d’urgence sans attendre, puis test 21 jours après'],
          ['Phase haute de 19 jours ou plus sans règles', 'Test de grossesse'],
          ['Pas de règles 42 jours après le retrait (ou après les dernières règles)', 'Test de grossesse'],
          ['Pas de règles 3 mois après le retrait, test négatif', 'Consultation (6 mois si tes cycles étaient irréguliers avant la pose)'],
          ['Test positif avec douleur d’un côté, saignement ou malaise', 'Urgence : 15 ou 112 (grossesse extra-utérine possible)'],
          ['Fièvre, douleurs dans le bas du ventre ou pertes malodorantes dans les jours qui suivent le retrait', 'Consultation rapide (infection possible)'],
        ],
      ),
      sources(S.fsrhIuc, S.fsrhEc, S.nhsIud, S.nhsIus, S.rcpMirena, S.mirenaFda, S.yland, S.apter, S.access, S.nilsson, S.mynfpPost, S.whoSwitch, S.asrm2024),
    ],
  }),

  article({
    id: 'bien-demarrer',
    category: 'demarrer',
    title: 'Bien démarrer avec Lune',
    summary: 'Lire l’écran du jour, comprendre les prévisions, sauvegarder tes données et installer l’app.',
    evidence: null,
    blocks: [
      p('Lune t’aide à noter tes signes (température, glaire, saignements) et à leur appliquer les règles de la méthode symptothermique. Voici comment lire ce qu’elle t’affiche.'),
      hd('La décision du jour'),
      p('En haut de l’écran Aujourd’hui, une seule phrase :'),
      list(
        '**Protection nécessaire** : préservatif, ou pas de rapport, aujourd’hui. C’est la réponse par défaut dès qu’une donnée manque ou qu’une règle n’est pas remplie.',
        '**Protection nécessaire jusqu’à 18 h** : le double contrôle sera complet ce soir. Avant 18 h, tu restes fertile.',
        '**Pas de protection nécessaire selon les règles** : toutes les conditions sont réunies. Vérifie quand même que tes saisies sont justes.',
      ),
      p('Le bouton **i** explique toujours la décision : règle appliquée, valeurs, ligne auxiliaire, jour sommet, données manquantes, exclusions.'),
      hd('Les états d’un jour'),
      table(
        ['État', 'Ce que ça veut dire'],
        [
          ['Fertile', 'Protection nécessaire.'],
          ['Pas assez de données', 'Une mesure manque, une règle attend des valeurs ou le cycle ne peut pas être évalué : considère le jour comme fertile.'],
          ['Fertile jusqu’à 18 h', 'Le jour de bascule : fertile jusqu’à 18 h, puis infertile selon le double contrôle.'],
          ['Infertile en début de cycle', 'Seulement si tu as activé la règle de début de cycle et que toutes ses conditions sont remplies, sauf apparition de glaire. Le risque résiduel y est plus élevé.'],
          ['Infertile jusqu’aux règles', 'Le double contrôle (température + glaire ou col) est confirmé, jusqu’aux prochaines règles.'],
        ],
      ),
      p('Chaque état a une couleur, une icône et un texte : tu n’as jamais à te fier à la couleur seule. Des repères s’ajoutent parfois : règles, spotting, saignement post-retrait, cycle d’apprentissage, contraception d’urgence en cours, cas limite, évaluation douteuse.'),
      hd('Les prévisions sont indicatives'),
      p('Les dates des prochaines règles, de l’ovulation ou de la fenêtre fertile estimée sont affichées à part, avec une fourchette et un niveau de confiance. **Elles ne rendent jamais un jour infertile.** Ne les utilise pas comme contraception.'),
      p('Pendant le cycle 0 et le cycle 1 après le retrait, Lune n’affiche aucune prévision calendaire : il n’y a pas encore d’historique fiable.'),
      hd('Pourquoi autant de jours à protéger au début ?'),
      p('Pendant les premiers cycles après le retrait, il faudra protéger la plupart des jours. C’est normal : Lune considère un jour comme fertile tant que des mesures n’ont pas prouvé le contraire. Plus tes observations sont complètes (température chaque matin, glaire chaque jour), plus les jours infertiles identifiables seront nombreux par la suite.'),
      list(
        'Le **cycle 0**, du retrait à tes premières vraies règles, est entièrement protégé.',
        'Les **3 premiers cycles** sont des cycles d’apprentissage : Lune calcule l’évaluation pour que tu apprennes, mais recommande de te protéger chaque jour.',
        'La **règle de début de cycle** est désactivée par défaut : les jours avant l’ovulation restent à protéger.',
      ),
      callout('info', 'C’est attendu', 'Beaucoup de jours fertiles après un retrait de DIU, ce n’est un problème ni de ton corps, ni de l’app. C’est la prudence par défaut.'),
      hd('Note chaque jour'),
      steps(
        'Le matin au réveil, avant de te lever : ta température, avec l’heure.',
        'Dans la journée : ta glaire (sensation et aspect), en gardant la meilleure qualité observée.',
        'Les saignements : règles, spotting ou saignement post-retrait. Confirme tes vraies règles quand Lune te le demande.',
        'Les rapports, protégés ou non, et tout incident de préservatif.',
      ),
      p('Un oubli ? Note seulement ce que tu as réellement observé. Un jour vide reste « inconnu », donc fertile.'),
      hd('Sauvegarde'),
      list(
        'Tes données restent **uniquement sur ton téléphone** : pas de compte, pas de serveur, aucune copie ailleurs.',
        'Le revers : si tu perds ton téléphone ou si le navigateur efface ses données, tout disparaît. **Exporte une sauvegarde chaque semaine** depuis les Réglages, et garde le fichier dans un endroit fiable.',
        'Sur iPhone, **supprimer l’icône de l’écran d’accueil peut effacer tes données** : fais un export avant.',
        'Si Lune te propose le stockage persistant, accepte-le : il protège mieux tes données du nettoyage automatique.',
      ),
      hd('Installation'),
      steps(
        'Sur iPhone : ouvre Lune dans Safari (ou Chrome, Edge, Firefox depuis iOS 16.4), touche **Partager**, puis **Sur l’écran d’accueil**.',
        'Sur Android : ouvre le menu du navigateur, puis **Installer l’application** ou **Ajouter à l’écran d’accueil**.',
        'Ouvre ensuite toujours Lune depuis cette icône.',
      ),
      callout('attention', 'Installe avant ta première saisie', 'L’app installée ne partage pas ses données avec le navigateur, ni avec une app installée depuis un autre navigateur. Installe Lune **avant** de noter quoi que ce soit, et utilise toujours la même icône.'),
    ],
  }),

  /* ===== La méthode ===== */
  article({
    id: 'methode',
    category: 'methode',
    title: 'La symptothermie en bref',
    summary: 'Deux signes, un double contrôle, et une efficacité à regarder en face.',
    evidence: 'moyenne',
    blocks: [
      p('La méthode symptothermique repose sur une idée simple : ton corps envoie des signes qui suivent les hormones du cycle. En les notant chaque jour, on peut repérer le moment où l’ovulation est passée.'),
      hd('Les signes observés'),
      list(
        '**La température au réveil** : elle monte de 0,2 à 0,5 °C après l’ovulation, sous l’effet de la progestérone, et reste haute jusqu’aux règles.',
        '**La glaire cervicale** : elle devient plus humide, plus filante et plus glissante à l’approche de l’ovulation, puis redevient moins fertile.',
        '**Le col de l’utérus** (option) : il peut remplacer la glaire comme second signe.',
      ),
      hd('Le double contrôle'),
      p('Lune ne déclare la phase infertile après l’ovulation que quand **deux signes indépendants** sont d’accord : la montée de température est confirmée **et** le critère de glaire (ou de col) est rempli. On retient le plus tardif des deux, et la bascule a lieu le soir, à 18 h.'),
      p('Ni la température seule, ni un test d’ovulation, ni le calendrier ne peuvent rendre un jour infertile dans Lune.'),
      p('Ces règles s’inspirent de **Sensiplan**, la méthode de l’AG NFP, en Allemagne.'),
      hd('Efficacité : les vrais chiffres'),
      table(
        ['Situation (Sensiplan, femmes formées)', 'Grossesses pour 100 femmes en 13 cycles'],
        [
          ['Usage global de la méthode', '1,8'],
          ['Abstinence pendant la phase fertile', '0,43'],
          ['Préservatif pendant la phase fertile', '0,59'],
          ['Rapports non protégés pendant la phase fertile', '7,46'],
        ],
      ),
      p('Source : Frank-Herrmann 2007. Contraceptive Technology (2023) retient pour Sensiplan 0,4 % de grossesses la première année en usage parfait et 2 % en usage typique.'),
      callout('attention', 'Ce que ces chiffres ne disent pas', 'L’étude de 2007 a **exclu les femmes qui sortaient d’une contraception hormonale**, celles qui avaient des cycles de plus de 35 jours et celles qui venaient d’accoucher. Ces chiffres ne sont donc pas démontrés pour les premiers cycles après un DIU hormonal. Et les taux « typiques » des méthodes d’observation, issus d’études cliniques, sous-estiment probablement la réalité.'),
      callout('attention', 'Lune n’est pas Sensiplan', 'Une app maison ne peut pas revendiquer l’efficacité de Sensiplan : son algorithme n’a été validé par aucune étude, et aucun professionnel de santé n’a relu ses règles. La recommandation allemande S2k (2024) déconseille de recommander comme contraception fiable les apps fondées principalement sur la température ; elles peuvent servir à documenter son cycle.'),
      hd('Ce qui fait la différence'),
      list(
        'Une **formation** avec une conseillère certifiée, recommandée par la S2k.',
        'Des observations **complètes** : température chaque matin, glaire chaque jour.',
        'Le respect de chaque jour fertile, par l’abstinence ou le préservatif. L’abstinence est un peu plus efficace (0,43 contre 0,59) : c’est un choix de couple, sans jugement.',
        'Accepter que la phase fertile soit longue : environ **13 jours par cycle** en médiane dans l’étude de 2007 ; l’OMS compte en moyenne 17 jours à protéger, selon la longueur du cycle.',
      ),
      sources(S.sensiplanFaq, S.sensiplanApp, S.s2k, S.frank2007, S.ct22, S.who, S.loesung),
    ],
  }),

  article({
    id: 'temperature',
    category: 'methode',
    title: 'Bien mesurer ta température',
    summary: 'Le bon thermomètre, le bon moment, et quoi faire d’une mesure perturbée.',
    evidence: 'moyenne',
    blocks: [
      p('La température au réveil (dite basale) monte après l’ovulation. Cette montée est petite, de 0,2 à 0,5 °C : la façon de mesurer compte autant que le thermomètre.'),
      hd('Le thermomètre'),
      list(
        'Numérique, **à 2 décimales** (par exemple 36,47), précis à 0,05 °C au moins, marqué CE.',
        'Pas de thermomètre d’oreille, frontal ou infrarouge, ni de mesure sous le bras.',
        '**Un seul thermomètre** pendant tout le cycle.',
      ),
      hd('La mesure'),
      steps(
        '**Au réveil, avant de te lever**, après au moins 1 h de repos allongée. Vise au moins 3 h de sommeil.',
        'Choisis ta voie : **vaginale ou rectale** (recommandées) ou **buccale**. Garde la même voie tout le cycle.',
        'Mesure **au moins 3 minutes**, et **5 minutes en bouche**. Pas seulement jusqu’au bip.',
        'Note la valeur et l’heure. Essaie de mesurer à peu près à la même heure chaque matin.',
      ),
      callout('attention', 'Même voie, même thermomètre', 'Changer de voie ou de thermomètre en cours de cycle rend les valeurs incomparables. Changer de voie de mesure rend automatiquement le cycle non évaluable. Si tu changes de thermomètre, coche « Nouveau thermomètre » dans Noter (ou déclare le cycle non évaluable) : Lune passe alors le cycle en « non évaluable » à partir de ce jour, et il reste entièrement fertile. Tu peux changer au début du cycle suivant.'),
      p('Si tu mesures plus de 1 h 30 avant ou après ton heure habituelle, Lune te demande si la mesure a été perturbée. Elle ne l’exclut jamais toute seule : la tolérance varie d’une femme à l’autre.'),
      hd('Ce qui peut fausser une mesure'),
      list(
        'fièvre ou maladie ;',
        'alcool ;',
        'nuit courte ou sommeil perturbé ;',
        'mesure à une heure inhabituelle ;',
        'décalage horaire ou voyage ;',
        'stress important ;',
        'médicament : antalgique, antihistaminique, remède contre le rhume, cortisone…',
      ),
      p('Note la perturbation **le jour même**, avec la valeur. En cas de fièvre, tu peux ne pas mesurer : le motif « maladie » suffit.'),
      hd('Exclure une valeur : les règles du jeu'),
      list(
        'Une exclusion n’est possible **qu’avec un motif**.',
        'Seulement pour une valeur perturbée **vers le haut** : une valeur trop basse ne peut pas imiter une montée.',
        'Seulement **avant la confirmation** de la montée : ensuite, les perturbations n’ont plus d’effet sur l’évaluation.',
        'Lune **refuse** d’exclure une valeur qui retombe pendant une montée : ce serait contourner les règles (voir « Comment l’app décide »).',
        'Une valeur exclue compte comme absente. S’il manque plus de **2 jours de valeurs** entre la première des 6 valeurs basses et la confirmation, Lune ne retient pas cette montée.',
        'Une exclusion parmi les 6 valeurs basses abaisse la ligne auxiliaire : Lune te le signale.',
        'Reste cohérente d’un cycle à l’autre. Lune affiche le nombre d’exclusions de chaque cycle.',
      ),
      callout('info', 'Plusieurs jours perturbés ?', 'Après un long voyage avec décalage horaire, ou avec une courbe très instable, tu peux déclarer le cycle « non évaluable ». Il est alors entièrement fertile, et le cycle suivant reste fertile dès son premier jour, jusqu’au double contrôle.'),
      hd('L’arrondi'),
      p('Avant toute comparaison, Lune arrondit chaque valeur au 0,05 °C le plus proche : 36,22 devient 36,20, et 36,23 devient 36,25. Quand une montée est tout juste suffisante, Lune affiche « cas limite » : attendre 1 à 2 jours de plus est prudent.'),
      sources(S.loesung, S.mynfpTemp, S.mynfpFaq, S.sensiplanFaq, S.fsrhFam),
    ],
  }),

  article({
    id: 'glaire',
    category: 'methode',
    title: 'Observer ta glaire',
    summary: 'Les catégories t, ∅, f, S et S+, les sensations, les aspects, et ce qui n’est pas de la glaire.',
    evidence: 'moyenne',
    blocks: [
      p('La glaire cervicale est produite par le col de l’utérus. Sous l’effet des œstrogènes, elle change avant l’ovulation : plus humide, plus fluide, plus glissante.'),
      hd('Comment observer'),
      steps(
        'Plusieurs fois dans la journée, idéalement **avant d’uriner**.',
        '**Ressens** : à l’entrée du vagin, en marchant ou en t’essuyant, quelle sensation ? Sec, rien, humide, mouillé ?',
        '**Regarde** : sur le papier ou les doigts, vois-tu quelque chose ? Quel aspect ?',
        'Observe toujours au même endroit pendant tout le cycle.',
        'Le soir, note **la meilleure qualité de la journée**, c’est-à-dire la plus fertile.',
      ),
      hd('Les catégories'),
      table(
        ['Code', 'Sensation', 'Aspect'],
        [
          ['t (sec)', 'sec, rêche, qui gratte, désagréable', 'rien vu'],
          ['∅ (rien)', 'rien senti, pas d’humidité', 'rien vu'],
          ['f (humide)', 'humide', 'rien vu'],
          ['S', 'humide ou rien senti', 'épaisse, blanchâtre, trouble, crémeuse, grumeleuse, jaunâtre, collante, laiteuse, non étirable, tenace'],
          ['S+', 'humide ou rien senti', 'transparente, comme du blanc d’œuf cru (même avec des filaments blancs), étirable, filante, liquide « qui coule comme de l’eau », rougeâtre, brun-rouge ou jaune-rougeâtre'],
          ['S+', '**mouillé, glissant, comme huilé, doux, lisse**', 'quel que soit l’aspect, même si rien n’est vu'],
        ],
      ),
      callout('attention', 'Humide ou mouillé ?', 'Ce n’est pas la même chose. **Humide** (f) : une légère moiteur. **Mouillé, glissant** (S+) : la sensation de glisser, comme huilé. Une sensation mouillée compte S+ même si tu ne vois rien.'),
      p('Dans Lune, tu notes la sensation et l’aspect séparément. La valeur du jour est la plus fertile des deux. Une saisie partielle compte. Si tu notes seulement l’aspect « rien vu », sans sensation, l’observation est incomplète.'),
      hd('Ce qui compte comme S+'),
      list(
        'Une sensation mouillée ou glissante, même sans rien voir.',
        'Un **spotting** (petit saignement) en dehors des règles : une glaire rougeâtre ou brunâtre est classée S+.',
      ),
      hd('Ce qui n’est pas de la glaire'),
      list('le sang des règles ;', 'les pertes dues à une infection ;', 'la lubrification de l’excitation sexuelle ;', 'le sperme après un rapport.'),
      p('Lune ne peut pas faire la différence. Si ton observation est brouillée (après un rapport, pendant une infection), coche **« observation douteuse »** : le jour compte comme non observé, donc fertile.'),
      callout('info', 'Un jour sans observation', 'Un jour non noté n’est jamais considéré comme sec. Il reste « inconnu », donc fertile. Après le jour sommet, un seul jour manquant bloque la fin de la phase fertile.'),
      hd('Le jour sommet'),
      p('Le **jour sommet** est le dernier jour de ta meilleure qualité de glaire du cycle, suivi de 3 jours de qualité inférieure. On ne le reconnaît qu’après coup. Dans environ 82 % des cas, l’ovulation tombe à 1 jour près du sommet (Gnoth 1996, cité par Baur 2010).'),
      sources(S.loesung, S.mynfpGlaire, S.baur, S.feuille),
    ],
  }),

  article({
    id: 'col',
    category: 'methode',
    title: 'Observer le col (option)',
    summary: 'Une alternative à la glaire, à combiner avec la température, jamais seule.',
    evidence: 'faible',
    blocks: [
      p('Le col de l’utérus change au fil du cycle : fermé et dur en dehors de la période fertile, il s’ouvre et devient plus mou autour de l’ovulation. Dans Lune, tu peux l’observer **à la place** de la glaire (réglage par cycle). Environ 10 % des utilisatrices de méthodes naturelles le font.'),
      hd('Comment observer'),
      steps(
        'Une seule fois par jour, avec les mains propres.',
        'Toujours avec le même doigt et dans la même position.',
        'Note l’**ouverture** (fermé, mi-ouvert, ouvert) et la **fermeté** (dur, mou). La hauteur est facultative : Lune ne s’en sert pas.',
      ),
      hd('Comment Lune l’utilise'),
      list(
        '**Début de la phase fertile** : dès le moindre changement, c’est-à-dire tout état autre que « fermé et dur ».',
        '**Fin du critère col** : le soir du **3e jour consécutif** observé « fermé et dur », après le dernier jour modifié, sans retour d’un état fertile jusqu’à la confirmation de la température.',
        'Le **double contrôle avec la température** reste obligatoire.',
      ),
      callout('attention', 'Jamais seul', 'Le col ne doit jamais servir de seul indicateur (FSRH). Après un accouchement par voie basse, il peut ne jamais se fermer complètement.'),
      sources(S.loesung, S.mynfpCol, S.fsrhFam),
    ],
  }),

  article({
    id: 'decision',
    category: 'methode',
    title: 'Comment l’app décide',
    summary: 'La règle des 3 sur 6, le jour sommet, la bascule de 18 h et la règle de début de cycle, avec des exemples.',
    evidence: 'moyenne',
    blocks: [
      p('Lune applique un principe de base : **tout jour est fertile tant que les mesures n’ont pas prouvé le contraire.** Une donnée manquante, une évaluation en attente ou un doute donnent toujours « Protection nécessaire ».'),
      hd('1. La montée de température : 3 sur 6'),
      p('Lune cherche **3 valeurs consécutives plus hautes que les 6 valeurs précédentes**. La 3e doit dépasser d’au moins 0,20 °C la plus haute des 6 valeurs basses. Cette valeur la plus haute trace la **ligne auxiliaire**. Une valeur **sur** la ligne ne compte pas comme haute.'),
      p('Exemple, valeurs déjà arrondies : J10 36,45 · J11 36,50 · J12 36,40 · J13 36,55 · J14 36,50 · J15 36,45. La plus haute est 36,55 : c’est la ligne.'),
      table(
        ['Cas', 'Valeurs après la ligne (36,55)', 'Résultat'],
        [
          ['Règle de base', 'J16 36,65 · J17 36,60 · J18 36,75 (+0,20)', 'Montée confirmée le J18'],
          ['Exception 1 : la 3e valeur n’est pas assez haute', 'J16 36,65 · J17 36,60 · J18 36,70 (+0,15) · J19 36,60', 'Il faut une 4e valeur au-dessus de la ligne : confirmée le J19'],
          ['Exception 2 : une valeur retombe', 'J16 36,65 · J17 36,55 (sur la ligne, ignorée) · J18 36,70 · J19 36,75 (+0,20)', 'La 3e valeur haute comptée (la 4e mesure en partant de la 1re valeur haute) doit être au moins 0,20 °C au-dessus de la ligne : confirmée le J19'],
          ['Exceptions combinées', 'comme l’exception 2, mais J19 36,70 (+0,15)', 'Pas de confirmation : les deux exceptions ne se combinent jamais'],
        ],
      ),
      p('Même si la valeur retombée est la 2e et que la 3e mesure atteint déjà +0,20, il faut attendre la 4e mesure.'),
      p('Quand une tentative échoue, Lune teste la valeur haute suivante, avec une nouvelle série de 6 valeurs basses. Il faut au moins 7 valeurs valides avant qu’une montée puisse être repérée, et pas plus de 2 jours sans valeur entre la première des 6 valeurs basses et la confirmation.'),
      callout('info', 'Après un DIU hormonal', 'Pendant les premiers cycles après un DIU hormonal (ou de type inconnu), Lune exige **une valeur haute de plus** au-dessus de la ligne, sans exigence de +0,20. Cette sécurité s’arrête après le premier cycle où une montée est confirmée. Pour un DIU au cuivre, elle est désactivée par défaut, mais tu peux l’activer.'),
      hd('2. La glaire : sommet + 3 jours'),
      p('Le jour sommet est le dernier jour de ta meilleure qualité de glaire, suivi de **3 jours consécutifs** de qualité inférieure, tous observés. Le critère glaire est rempli **le soir du 3e jour**.'),
      list(
        'Si ta meilleure qualité revient avant la fin de l’évaluation, le sommet tombe et Lune en cherche un plus tardif.',
        'Un jour non observé pendant ces 3 jours, ou jusqu’à la confirmation de la température, bloque l’évaluation. Le cycle reste fertile, sauf si tu complètes avec ce que tu as réellement observé.',
        'Un sommet sur une glaire seulement humide (f) est accepté, avec un avertissement. Si tu n’as noté que du sec ou du « rien », il n’y a pas de sommet : le cycle reste fertile jusqu’aux règles.',
      ),
      hd('3. Le double contrôle et la bascule de 18 h'),
      p('La phase infertile commence quand **les deux critères** sont remplis, au plus tardif des deux, **à 18 h** ce jour-là. Avant 18 h, le jour reste fertile.'),
      table(
        ['Exemple', 'Bascule'],
        [
          ['Température confirmée le J18, sommet le J17 (sommet + 3 = J20)', 'Le J20 à 18 h'],
          ['Sommet le J13 (sommet + 3 = J16), température confirmée le J19', 'Le J19 à 18 h'],
        ],
      ),
      p('Ensuite, le statut « infertile » dure jusqu’aux prochaines règles. Si tu modifies une donnée ancienne et que le résultat change, Lune te prévient.'),
      callout('attention', 'Test LH positif après la montée', 'Il rend l’évaluation douteuse : Lune écarte cette montée et attend de nouvelles valeurs. C’est un choix prudent de Lune, pas une règle Sensiplan.'),
      hd('4. Le début du cycle : désactivé par défaut'),
      p('Sensiplan prévoit une règle pour les premiers jours du cycle : **5 jours** infertiles au début, ou **moins 8** (le jour de ta montée de température la plus précoce, moins 8) quand tu as de l’historique. Dans Lune, **cette règle est désactivée par défaut** : aucun jour n’est déclaré infertile avant l’ovulation.'),
      p('Pourquoi ce choix :'),
      list(
        'C’est en début de cycle que le risque résiduel est le plus élevé. Dans une étude italienne citée par Frank-Herrmann, toutes les grossesses dues à la méthode venaient du groupe qui se fiait à la glaire seule pour le début du cycle.',
        'Les spermatozoïdes peuvent survivre jusqu’à 7 jours : une ovulation précoce suffit.',
        'Après un retrait, la règle est de toute façon impossible pendant le cycle 0 et le cycle 1.',
      ),
      p('Si tu l’actives dans les Réglages, elle ne s’applique que si **toutes** ces conditions sont réunies :'),
      list(
        'le cycle précédent a été suivi dans Lune et son double contrôle est confirmé ;',
        'ce n’est ni le cycle 0, ni le cycle 1 après le retrait ;',
        'le cycle précédent n’a été ni déclaré non évaluable, ni marqué par une contraception d’urgence ;',
        'chaque jour depuis le début des règles est un jour de règles, ou un jour observé **sec ou rien**, sans spotting.',
      ),
      table(
        ['Ta montée la plus précoce', 'Jours infertiles en début de cycle'],
        [
          ['Aucune encore', '5 jours (règle des 5 jours)'],
          ['Au J12', '4 jours (12 − 8)'],
          ['Au J8', 'Aucun'],
          ['Au J15, après 12 cycles avec montée depuis le retrait', '7 jours'],
        ],
      ),
      p('La montée la plus précoce est retenue **sur tous tes cycles**, à vie : elle ne peut que raccourcir cette période. Dès que la glaire apparaît (humide, S ou S+), tout redevient fertile jusqu’au double contrôle. Le jour même, tant que ta glaire n’est pas notée, le statut reste « à confirmer », donc fertile. La règle « moins 20 » n’est pas utilisée.'),
      callout('info', 'Et le mode apprentissage ?', 'Pendant les 3 premiers cycles après le retrait, Lune recommande de te protéger chaque jour, quels que soient les résultats. Voir « Cycles d’apprentissage ».'),
      sources(S.loesung, S.feuille, S.mynfpTemp, S.mynfpCombi, S.mynfpDebut, S.mynfpPost, S.frank2007),
    ],
  }),

  article({
    id: 'apprentissage',
    category: 'methode',
    title: 'Cycles d’apprentissage',
    summary: 'Pourquoi Lune te recommande de te protéger pendant 3 cycles, le mode strict, et l’intérêt d’une formation.',
    evidence: 'faible',
    blocks: [
      p('Après un retrait de DIU, ton corps reprend son rythme, et toi, tu apprends à lire tes signes. Les deux prennent du temps.'),
      hd('Ce que fait le mode apprentissage'),
      list(
        'Il est **actif par défaut** pendant les **3 premiers cycles complets** après le retrait. Le cycle 0, lui, est de toute façon entièrement protégé.',
        'Lune calcule et affiche l’évaluation complète, pour que tu puisses la comparer à ta propre lecture.',
        'Mais la recommandation du jour reste **« Protection nécessaire (cycle d’apprentissage) »**, même les jours que les règles donneraient infertiles.',
        'Tu peux en sortir à tout moment dans les Réglages, après un écran qui récapitule les risques.',
      ),
      p('Sensiplan observe qu’au bout d’environ **3 cycles d’observation**, les femmes savent repérer leurs phases.'),
      hd('Le mode strict FSRH'),
      p('Option plus prudente : protection **tous les jours** jusqu’à ce que 3 cycles après le retrait soient passés **et** que tes cycles soient réguliers selon les critères FIGO. Il est conseillé si ton DIU était hormonal ou de type inconnu.'),
      p('Il reprend une recommandation britannique (FSRH 2015) : ne pas se fier aux signes de fertilité avant d’avoir des cycles réguliers et au moins 3 cycles depuis l’arrêt. C’est un avis d’experts, avec un niveau de preuve faible.'),
      callout('info', 'Les avis divergent', 'Sensiplan permet d’observer tout de suite, avec un premier cycle entièrement fertile. Santé publique France demande une formation et **12 cycles d’observation** sans contraception hormonale avant de se fier à la méthode. Lune retient 3 cycles d’apprentissage par défaut, avec l’option stricte.'),
      hd('Te former avec une conseillère'),
      list(
        'La recommandation allemande S2k (2024) conseille une formation ou un accompagnement par une **conseillère certifiée**. C’est la voie la plus fiable.',
        'Le manuel de référence est « Natürlich & sicher – Das Praxisbuch », en allemand. Une édition révisée était annoncée pour février 2026 ; on ne sait pas si les règles ont changé.',
        'Sensiplan propose un e-learning (environ 49 €) et un conseil individuel (environ 95 €), en allemand, selon son site (tarifs non revérifiés).',
        'Le réseau français de conseillères Sensiplan n’a pas été vérifié pour cette app.',
      ),
      callout('attention', 'Fais relire les règles', 'Les règles de Lune n’ont été validées ni par une conseillère Sensiplan, ni par un professionnel de santé. Avant de t’en servir comme contraception, fais-les vérifier par une conseillère.'),
      sources(S.fsrhFam, S.s2k, S.sensiplanAbout, S.sensiplanBook, S.spf, S.mynfpPost, S.figo),
    ],
  }),

  article({
    id: 'lh',
    category: 'methode',
    title: 'Les tests d’ovulation (LH)',
    summary: 'Ce qu’un test LH dit vraiment, et pourquoi il ne rend jamais un jour infertile.',
    evidence: 'moyenne',
    blocks: [
      p('Les tests d’ovulation urinaires détectent l’hormone LH (hormone lutéinisante), dont le pic déclenche l’ovulation.'),
      hd('Ce qu’un test dit'),
      list(
        '**Positif** : fertilité maximale, ovulation probable dans les 24 à 48 h.',
        '**Négatif** : ça ne veut **jamais** dire infertile.',
      ),
      hd('Pourquoi il ne suffit pas'),
      list(
        'Un positif ne prévient que 1 à 2 jours avant l’ovulation, alors que la fenêtre fertile est ouverte depuis environ 5 jours.',
        'Le pic dans l’urine arrive **après** l’ovulation dans 23 % des cas, et il n’est unique que dans 42 à 58 % des cas (myNFP).',
        'Les moniteurs repèrent le début de la fenêtre fertile environ 2 jours plus tard que la glaire (FSRH).',
        'Environ 7 % des tests sont des faux positifs (ASRM).',
      ),
      p('Dans le sang, la montée de LH précède l’ovulation d’environ 32 h en médiane (24 à 56 h), et le pic d’environ 16,5 h (OMS 1980). Dans l’urine, le pic se voit plus tard.'),
      hd('Dans Lune'),
      list(
        'Le test LH est une saisie facultative. Ce n’est **jamais** un critère d’infertilité.',
        'Un positif **après** la montée de température rend l’évaluation douteuse : Lune attend de nouvelles valeurs.',
        'Conseil d’usage : n’utilise pas l’urine du premier matin.',
      ),
      sources(S.mynfpLh, S.who1980, S.fsrhFam, S.asrm2021, S.endotext),
    ],
  }),

  article({
    id: 'calendrier-faux',
    category: 'methode',
    title: 'Pourquoi les applis calendrier se trompent',
    summary: 'Le J14, les cycles de 28 jours et les prédictions : ce que disent les données.',
    evidence: 'solide',
    blocks: [
      p('Beaucoup d’applis estiment ta fenêtre fertile à partir de la durée de tes cycles passés. Le problème : la date de l’ovulation varie beaucoup, même chez les femmes régulières.'),
      hd('Ce que montrent les grandes études'),
      list(
        'Sur plus de 600 000 cycles (Bull 2019), la durée moyenne est de 29,3 jours, et **seulement 13 % des cycles durent 28 jours**.',
        'La phase avant l’ovulation est la plus variable : entre 10 et 30 jours pour 95 % des cycles.',
        '**Du J6 au J21**, chaque jour a au moins 10 % de probabilité d’être dans la fenêtre fertile (Wilcox 2000).',
        'Même avec des cycles réguliers, 1 à 6 % des femmes sont dans leur fenêtre fertile le jour où leurs règles sont attendues (Wilcox 2000).',
        'Les applis calendrier trouvent le bon jour d’ovulation dans 21 % des cas au mieux (Johnson 2018).',
        '42,5 % des femmes « régulières » ont plus de 7 jours d’écart entre leurs cycles (Fehring).',
        'Une ovulation tardive reste possible jusqu’à la 5e ou la 6e semaine.',
      ),
      hd('Les applis à l’épreuve'),
      list(
        'Stiftung Warentest (2017) : sur 23 applis testées, 18 jugées insuffisantes. Les meilleures utilisaient la température et la glaire.',
        'Nouveau test en 2023 : aucune appli jugée « bonne » ; les deux premières, fondées sur la température et la glaire, sont jugées « satisfaisantes ».',
        'Duane 2016 : seulement 6 applis exactes sur 30. Zwingerman 2020 : 31 applis sur 140 avec des erreurs graves.',
      ),
      hd('Et l’efficacité ?'),
      p('La méthode du calendrier (Ogino) conduit à environ 15 à 20 grossesses pour 100 femmes par an (Contraceptive Technology). L’OMS ne dispose même pas de taux fiables pour cette méthode.'),
      callout('info', 'Dans Lune', 'Lune affiche des prévisions (règles, ovulation, fenêtre estimée) pour t’aider à t’organiser, avec des fourchettes. **Elles ne rendent jamais un jour infertile.** Seules tes observations le peuvent, avec le double contrôle.'),
      p('Lune ne fige pas non plus la phase après l’ovulation à 14 jours : mesurée par la température, elle dure en moyenne 12,4 jours, avec des écarts de plusieurs jours.'),
      sources(S.bull, S.wilcox2000, S.johnson, S.fehring, S.testDe, S.duane, S.zwingerman, S.ct22, S.who),
    ],
  }),

  /* ===== Ton cycle ===== */
  article({
    id: 'phases',
    category: 'corps',
    title: 'Les 4 phases du cycle',
    summary: 'Ce que font les hormones, des règles à la phase lutéale.',
    evidence: 'solide',
    blocks: [
      p('Un cycle va du premier jour des règles (J1) à la veille des règles suivantes. Il dure en moyenne 29,3 jours, avec de grands écarts entre les femmes et d’un cycle à l’autre. Les chiffres ci-dessous sont des moyennes.'),
      hd('1. Les règles'),
      list(
        'Elles durent en moyenne 4 jours ; de 2 à 8 jours, c’est normal.',
        'La perte moyenne est d’environ 30 mL pour l’ensemble des règles.',
        'Les crampes viennent des prostaglandines, des substances produites par la muqueuse de l’utérus (endomètre).',
        'L’hormone FSH, qui fait mûrir les follicules de l’ovaire, remonte dès la fin du cycle précédent.',
      ),
      hd('2. La phase folliculaire'),
      list(
        'C’est la phase **la plus variable** : 16,9 jours en moyenne, mais de 10 à 30 jours pour 95 % des cycles.',
        'Un follicule mûrit et produit de l’œstradiol, un œstrogène, qui augmente.',
        'La glaire augmente pendant les 5 à 6 jours qui précèdent l’ovulation et culmine 2 à 3 jours avant.',
        'La température reste basse.',
      ),
      hd('3. L’ovulation'),
      list(
        'Le début du pic de LH précède l’ovulation de 34 à 36 h.',
        'L’ovocyte est libéré par un ovaire ou l’autre, au hasard : il n’y a pas d’alternance gauche-droite.',
        'Il ne vit que peu de temps. Les spermatozoïdes, eux, peuvent survivre environ 5 jours, et jusqu’à 7 jours selon le NHS.',
        'La fenêtre fertile dure donc environ 6 jours et se termine le jour de l’ovulation. La probabilité de conception passe d’environ 10 % cinq jours avant à environ 33 % le jour même (Wilcox 1995).',
      ),
      hd('4. La phase lutéale'),
      list(
        'Le follicule vide devient le corps jaune, qui produit de la progestérone et de l’œstradiol. Leur pic arrive 8 à 9 jours après l’ovulation, puis ils déclinent à partir du 9e au 11e jour.',
        'La progestérone fait monter la température de 0,2 à 0,5 °C.',
        'Cette phase dure en moyenne 12,4 jours quand on la mesure par la température (environ 14 jours si on la mesure à partir du pic de LH). Elle varie moins que la phase folliculaire, mais elle n’est pas fixe.',
        'Sans grossesse, les hormones chutent et les règles arrivent.',
      ),
      callout('info', 'Un cycle normal, c’est quoi ?', 'Selon la FIGO (2018), un cycle normal dure **24 à 38 jours**, et des règles normales durent **8 jours au plus**. D’autres sources donnent d’autres repères (23 à 35 jours pour l’Assurance maladie, 21 à 35 jours pour le NHS) : Lune retient la FIGO.'),
      sources(S.endotext, S.bull, S.wilcox1995, S.asrm2021, S.figo, S.who),
    ],
  }),

  article({
    id: 'ressentis',
    category: 'corps',
    title: 'Ce que tu peux ressentir selon les phases',
    summary: 'Libido, humeur, sommeil, peau, sport : des tendances, pas des règles.',
    evidence: 'moyenne',
    blocks: [
      p('Chaque femme est différente : ce qui suit, ce sont des **tendances moyennes**. Noter tes symptômes et ton humeur dans Lune t’aidera à repérer les tiennes.'),
      hd('Autour de l’ovulation'),
      list(
        '**Libido** souvent plus élevée, liée à l’œstradiol ; elle tend à baisser avec la progestérone (Roney 2013, preuve moyenne).',
        '**Douleur d’ovulation** possible : d’un seul côté, de quelques minutes à 1 ou 2 jours (NHS).',
      ),
      hd('En fin de phase lutéale'),
      p('Symptômes fréquents la semaine avant les règles :'),
      list('seins sensibles ;', 'ballonnements ;', 'appétit qui change ;', 'irritabilité ou humeur plus basse ;', 'fatigue, sommeil moins bon ;', 'maux de tête ;', 'peau qui change.'),
      hd('Sommeil'),
      p('Le sommeil est moins bon avant les règles chez les femmes qui ont un syndrome prémenstruel ou des règles douloureuses (Baker et Lee 2018).'),
      hd('Peau'),
      p('Chez les femmes qui ont de l’acné, 65 % décrivent une poussée liée au cycle, surtout la semaine avant les règles (Geller 2014, 105 femmes).'),
      hd('Sport'),
      p('L’effet du cycle sur la performance est très faible et varie d’une étude à l’autre (McNulty 2020). Aucun effet n’est démontré sur la force (Colenso-Semple 2023). Fie-toi à tes sensations plutôt qu’à un programme calé sur les phases.'),
      callout('info', 'Quand en parler', 'Si des symptômes avant les règles pèsent sur ta vie, note-les chaque jour pendant 2 cycles et parles-en à un médecin. Voir « SPM et TDPM ».'),
      sources(S.nhsOvPain, S.nhsPms, S.sport),
    ],
  }),

  article({
    id: 'decalages',
    category: 'corps',
    title: 'Ce qui peut décaler ton cycle',
    summary: 'Stress, poids, sport, maladie, voyage, contraception d’urgence : ce qui retarde l’ovulation.',
    evidence: 'moyenne',
    blocks: [
      p('La plupart de ces facteurs **retardent l’ovulation** : la phase avant l’ovulation s’allonge et les règles arrivent plus tard.'),
      list(
        '**Stress, perte de poids, manque d’énergie, sport intensif** : ils peuvent aller jusqu’à suspendre les règles (aménorrhée hypothalamique fonctionnelle).',
        '**Poids** : avec un IMC de 40 ou plus, les cycles sont en moyenne plus longs de 1,5 jour ; au-dessus de 35, ils varient 14 % de plus.',
        '**Âge** : le cycle raccourcit d’environ 0,18 jour par an entre 25 et 45 ans, et varie davantage avant 20 ans et après 45 ans.',
        '**Arrêt d’une contraception hormonale**, allaitement, troubles de la thyroïde.',
        '**Maladie, fièvre, voyage.**',
        '**Contraception d’urgence** : après l’ulipristal (ellaOne), 18,5 % des femmes ont leurs règles plus de 7 jours en retard, 4 % plus de 20 jours, et 6,8 % plus de 7 jours en avance.',
        '**Fièvre et médicaments** : la fièvre, les antihistaminiques (qui modifient la glaire) et certains autres médicaments faussent les signes.',
      ),
      hd('Dans Lune'),
      list(
        'Note ces événements dans ta saisie : maladie, voyage, stress majeur, nouveau médicament…',
        'Le cycle est alors marqué atypique et exclu des statistiques et des prévisions, qui deviennent moins fiables.',
        'Tes observations, elles, continuent de compter : une ovulation retardée reste repérée par la température et la glaire.',
      ),
      callout('info', 'Un cycle long n’est pas un cycle sans risque', 'Tant que le double contrôle n’est pas confirmé, chaque jour reste fertile, même au 40e jour.'),
      sources(S.endocrine, S.apple, S.bull, S.ellaone, S.who),
    ],
  }),

  article({
    id: 'idees-recues',
    category: 'corps',
    title: 'Idées reçues',
    summary: 'J14, jours sans risque après les règles, cycle syncing, synchronisation entre femmes, vitamine B6…',
    evidence: 'solide',
    blocks: [
      hd('« On ovule toujours au J14 »'),
      p('**Faux pour la majorité.** Seuls 13 % des cycles durent 28 jours, et la phase avant l’ovulation varie de 10 à 30 jours (Bull 2019). Du J6 au J21, chaque jour a au moins 10 % de probabilité d’être dans la fenêtre fertile (Wilcox 2000).'),
      hd('« Juste après les règles, il n’y a pas de risque »'),
      p('**Faux en général.** Avec une ovulation précoce, la fenêtre fertile peut commencer juste après les règles, et les spermatozoïdes peuvent survivre jusqu’à 7 jours (NHS).'),
      hd('« Mes cycles sont réguliers, je sais quand j’ovule »'),
      p('Même avec des cycles réguliers, 1 à 6 % des femmes sont dans leur fenêtre fertile le jour où elles attendent leurs règles (Wilcox 2000). Et 42,5 % des femmes qui se disent régulières ont plus de 7 jours d’écart entre leurs cycles (Fehring).'),
      hd('« Test d’ovulation négatif, donc pas de risque »'),
      p('**Non.** Un test LH négatif ne veut jamais dire infertile : la fenêtre fertile s’ouvre environ 5 jours avant l’ovulation.'),
      hd('« Pas de règles sous stérilet hormonal, donc pas d’ovulation »'),
      p('**Non.** La majorité des femmes ovulent sous DIU hormonal, même sans règles. Une ovulation est possible peu après le retrait.'),
      hd('« Les ovaires ovulent chacun leur tour »'),
      p('**Non.** L’ovulation se fait d’un côté ou de l’autre, au hasard.'),
      hd('Le « cycle syncing »'),
      p('Adapter son sport ou son alimentation à chaque phase n’est **pas fondé sur des preuves**. L’effet du cycle sur la performance sportive est très faible, et aucun effet n’est démontré sur la force. Le « seed cycling » (manger certaines graines selon la phase) n’a aucune donnée.'),
      hd('« Les femmes qui vivent ensemble finissent par avoir leurs règles en même temps »'),
      p('**Non confirmé** par les études (Yang et Schank 2006).'),
      hd('Vitamine B6 et gattilier contre le SPM'),
      p('Les preuves sont **insuffisantes**. Ce que recommande l’ACOG (2023) : activité physique, calcium, thérapie cognitive et comportementale, anti-inflammatoires, et des antidépresseurs (ISRS) sur prescription.'),
      hd('« Une appli de règles, c’est une contraception »'),
      p('Une appli calendrier, non. Même pour les méthodes d’observation, l’efficacité dépend de la formation, de la régularité des observations et du respect de chaque jour fertile. Voir « Efficacité des contraceptions ».'),
      sources(S.bull, S.wilcox2000, S.nhsAfter, S.fehring, S.mynfpLh, S.apter, S.endotext, S.sport, S.synchro, S.acogPms),
    ],
  }),

  /* ===== Santé ===== */
  article({
    id: 'douleurs',
    category: 'sante',
    title: 'Règles douloureuses',
    summary: 'Ce qui soulage vraiment, et les signes qui doivent faire consulter.',
    evidence: 'moyenne',
    blocks: [
      p('Les douleurs de règles (dysménorrhée) viennent surtout des prostaglandines, des substances produites par la muqueuse de l’utérus. Après le retrait d’un DIU, surtout hormonal, tes règles peuvent redevenir plus douloureuses qu’avec le stérilet.'),
      hd('Ce qui marche'),
      list(
        '**Anti-inflammatoires (AINS)**, comme l’ibuprofène : ils soulagent 45 à 53 % des femmes, contre 18 % avec un placebo, et semblent plus efficaces que le paracétamol (preuve faible). Ils ont un peu plus d’effets indésirables (Cochrane 2015).',
        'Prends-les **le plus tôt possible**, dès les premières douleurs, pendant 2 à 3 jours au maximum. Jamais deux AINS ensemble. Demande au pharmacien s’ils te conviennent.',
        '**Chaleur** (bouillotte, patch chauffant) : au moins aussi efficace que les antalgiques, d’après 2 essais (preuve faible).',
        '**Activité physique** : elle réduit la douleur d’environ 25 points sur une échelle de 100 (preuve faible).',
        '**TENS** (petit appareil de stimulation électrique de la peau) : efficace à haute fréquence, d’après de petits essais. La basse fréquence ne l’est pas.',
        '**Tabac** : fumer est associé à des règles plus douloureuses.',
      ),
      hd('Quand consulter'),
      p('Prends rendez-vous si :'),
      list(
        'la douleur est nouvelle et apparue à l’âge adulte ;',
        'elle s’aggrave au fil des mois ;',
        'les AINS ne la soulagent pas (ou un traitement hormonal après 3 à 6 mois) ;',
        'elle t’oblige à manquer le travail ou tes activités ;',
        'tu as mal pendant les rapports, surtout en profondeur ;',
        'la douleur est d’un seul côté ;',
        'tu as des saignements anormaux, de la fièvre ou des pertes purulentes.',
      ),
      p('Une douleur très intense (8/10 ou plus, qui fait manquer l’école ou le travail, ou qui résiste aux antalgiques simples) peut évoquer une endométriose. Voir « Endométriose ».'),
      callout('urgent', 'Urgence', `Douleur dans le bas du ventre sévère qui s’aggrave malgré les antalgiques, fièvre avec douleur et pertes anormales, ou douleur avec un retard de règles ou un test positif : ${URGENT_15}`),
      sources(S.cochraneNsaid, S.cochraneExercise, S.cochraneTens, S.chaleur, S.tabac, S.acog760, S.hasEndo),
    ],
  }),

  article({
    id: 'spm',
    category: 'sante',
    title: 'SPM et TDPM',
    summary: 'Reconnaître le syndrome prémenstruel, le noter, et ce qui aide vraiment.',
    evidence: 'moyenne',
    blocks: [
      p('Le syndrome prémenstruel (SPM), ce sont des symptômes qui reviennent **la semaine avant les règles**, disparaissent au début ou juste après, et gênent vraiment ta vie.'),
      p('Selon l’ACOG (2023, chiffres rapportés par une source secondaire) : jusqu’à 90 % des femmes ont au moins un symptôme, 20 à 30 % ont un SPM, et 2 à 5 % un TDPM.'),
      hd('Le TDPM'),
      p('Le trouble dysphorique prémenstruel (TDPM) est une forme sévère, centrée sur l’humeur. Selon le DSM-5, il faut au moins 5 symptômes, dont au moins un qui touche l’humeur (sautes d’humeur, irritabilité ou colère, humeur dépressive, anxiété ou tension), confirmés par des notes quotidiennes sur 2 cycles.'),
      hd('Le noter pour en parler'),
      steps(
        'Note chaque jour tes symptômes et ton humeur dans Lune, pendant **au moins 2 cycles**.',
        'Regarde s’ils se concentrent avant les règles et disparaissent ensuite.',
        'Exporte ce journal et apporte-le à ton médecin.',
      ),
      hd('Ce qui aide (ACOG 2023)'),
      list(
        'Activité physique (recommandation conditionnelle).',
        'Calcium, 1 000 à 1 200 mg par jour (recommandation conditionnelle).',
        'Thérapie cognitive et comportementale (TCC).',
        'Anti-inflammatoires (AINS) pour les douleurs (recommandation conditionnelle).',
        'Antidépresseurs de type ISRS, sur prescription.',
      ),
      p('L’alcool est associé au SPM, d’autant plus que la consommation est forte (études d’observation). **Vitamine B6 et gattilier** : preuves insuffisantes.'),
      callout('urgent', 'Idées suicidaires', 'Si tu as des idées suicidaires, appelle le **3114** ou le **15**.'),
      contact('Prévention du suicide'),
      sources(S.acogPms, S.nhsPms, S.alcool),
    ],
  }),

  article({
    id: 'endometriose',
    category: 'sante',
    title: 'Endométriose',
    summary: 'Les signes qui doivent faire y penser, sans alarmisme.',
    evidence: 'moyenne',
    blocks: [
      p('L’endométriose, c’est la présence, en dehors de l’utérus, d’un tissu qui ressemble à sa muqueuse. Elle touche environ **10 % des femmes** en âge d’avoir des enfants (OMS). Le diagnostic prend souvent du temps : de 4 à 12 ans selon l’OMS.'),
      hd('Signes évocateurs (HAS 2017)'),
      list(
        'Règles **très douloureuses** : 8/10 ou plus, absences fréquentes (école, travail), ou douleur qui résiste aux antalgiques simples.',
        'Douleurs **profondes** pendant les rapports.',
        'Douleurs en allant à la selle, ou signes urinaires, pendant les règles.',
        'Difficulté à concevoir.',
      ),
      callout('info', 'Pas de conclusion hâtive', 'Ces symptômes sont fréquents et ne sont pas toujours dus à une endométriose (HAS). Ils méritent simplement d’être évoqués avec un médecin, une sage-femme ou un gynécologue.'),
      hd('Après le retrait du DIU'),
      p('Le DIU au lévonorgestrel 52 mg (Mirena, Donasert) fait partie des traitements de première intention, comme la pilule œstroprogestative. S’il te soulageait, les douleurs peuvent revenir après le retrait : note-les dans Lune (intensité de 0 à 10, douleurs pendant les rapports, digestives ou urinaires).'),
      contact('EndoFrance'),
      contact('ENDOmind'),
      sources(S.whoEndo, S.hasEndo, S.ameliEndo),
    ],
  }),

  article({
    id: 'sopk',
    category: 'sante',
    title: 'SOPK',
    summary: 'Le syndrome des ovaires polykystiques : critères, signes, quand en parler.',
    evidence: 'solide',
    blocks: [
      p('Le syndrome des ovaires polykystiques (SOPK) touche **10 à 13 %** des femmes. Le NHS l’appelle désormais « PMOS ».'),
      hd('Les critères (recommandation internationale 2023)'),
      p('Le diagnostic demande **au moins 2 critères sur 3**, après avoir écarté d’autres causes :'),
      list(
        '**Excès d’androgènes** (hormones dites masculines).',
        '**Ovulation irrégulière** : cycles de moins de 21 jours ou de plus de 35 jours, ou moins de 8 cycles par an, à partir de 3 ans après les premières règles ; ou un cycle de plus de 90 jours.',
        '**Ovaires polykystiques** à l’échographie, ou hormone AMH élevée chez l’adulte.',
      ),
      hd('Signes possibles'),
      list('cycles longs ou absents ;', 'pilosité ;', 'chute de cheveux ;', 'acné ;', 'poids ;', 'difficulté à concevoir.'),
      callout('info', 'Dans Lune', 'Si tes cycles dépassent souvent 35 jours, ou si tu as moins de 8 cycles par an, Lune te suggère d’en parler à un médecin. Ce n’est pas un diagnostic. Les premiers cycles après un DIU hormonal peuvent aussi être longs.'),
      sources(S.sopk2023, S.nhsPcos),
    ],
  }),

  article({
    id: 'regles-abondantes',
    category: 'sante',
    title: 'Règles abondantes',
    summary: 'Comment savoir si tes règles sont trop abondantes, et quoi faire.',
    evidence: 'moyenne',
    blocks: [
      p('Des règles sont dites abondantes quand la perte de sang **retentit sur ta qualité de vie** (NICE, FIGO). En moyenne, on perd environ 30 mL pour l’ensemble des règles ; plus de 80 mL par cycle est anormal.'),
      p('Après un retrait de DIU, tes règles peuvent changer : plus abondantes qu’avec un DIU hormonal, probablement moins qu’avec un DIU au cuivre. C’est une déduction : aucune étude ne l’a mesuré après un retrait.'),
      hd('Les signes (NHS)'),
      list(
        'protection changée toutes les 1 à 2 h, ou besoin d’en mettre deux à la fois ;',
        'règles de plus de 7 jours ;',
        'caillots de plus de 2,5 cm ;',
        'débordements la nuit ;',
        'activités que tu évites à cause des règles ;',
        'fatigue ou essoufflement.',
      ),
      p('L’Assurance maladie cite aussi : une coupe vidée toutes les 2 à 3 h pendant plus de 7 jours, ou une culotte menstruelle pour flux abondant changée avant 12 h.'),
      hd('Le score de Higham'),
      p('Ce score compte tes protections selon qu’elles sont peu (1 point), moyennement (5) ou très remplies (20), plus les caillots et les débordements. Au-delà de 100 points, la perte est estimée autour de 80 mL. C’est **un indicateur, pas une mesure** : il a été validé sur peu de cycles.'),
      callout('attention', 'Fatigue ou essoufflement', 'Règles abondantes avec fatigue ou essoufflement : parles-en à ton médecin. Une prise de sang (numération) peut rechercher une anémie.'),
      hd('Le fer'),
      list(
        'Besoins (ANSES 2021) : 11 mg par jour si tes pertes sont faibles à modérées, 16 mg par jour si elles sont élevées.',
        'Le fer le mieux absorbé (héminique) vient des produits animaux.',
        'La vitamine C pendant le repas augmente l’absorption ; le thé pendant le repas la réduit.',
        'Ne prends pas de complément de fer sans dosage sanguin.',
      ),
      p('Règles de plus de 8 jours, ou qui pèsent sur ton quotidien : prends rendez-vous.'),
      callout('urgent', 'Urgence', `Saignement très abondant avec malaise ou grande faiblesse, ou saignement avec fièvre : ${URGENT_15}`),
      sources(S.nice, S.nhsHeavy, S.ameliSaign, S.figo, S.ansesFer, S.ansesFerInfo),
    ],
  }),

  article({
    id: 'choc-toxique',
    category: 'sante',
    title: 'Choc toxique menstruel',
    summary: 'Les bons réflexes avec les tampons et les coupes, et les signes d’alerte.',
    evidence: 'moyenne',
    blocks: [
      p('Le syndrome du choc toxique (SCT) est une réaction grave à une toxine bactérienne, liée au port de protections internes (tampon, coupe).'),
      hd('Les règles de Lune'),
      list(
        '**Tampon ou coupe : 6 h maximum** (ANSES 2022).',
        '**La nuit, une protection externe** : serviette ou culotte menstruelle.',
        'Une protection interne seulement pendant les règles, avec une absorption adaptée à ton flux.',
      ),
      p('Pourquoi : porter un tampon plus de 6 h double environ le risque, et le garder une nuit de plus de 8 h le triple environ (Billon 2020). Ces chiffres concernent le tampon ; l’ANSES étend la précaution aux coupes. Les anciennes consignes (4 à 8 h) étaient moins strictes.'),
      p('Les protections externes n’ont jamais été impliquées dans un choc toxique.'),
      hd('Les signes, d’apparition brutale'),
      list('fièvre élevée, plus de 39 °C ;', 'éruption qui ressemble à un coup de soleil ;', 'vomissements ou diarrhée ;', 'malaise ;', 'courbatures.'),
      callout('urgent', 'Que faire', '**Retire la protection et appelle le 15**, en précisant que tu portais un tampon ou une coupe.'),
      contact('SAMU'),
      sources(S.ansesSct, S.santeSct),
    ],
  }),

  article({
    id: 'quand-consulter',
    category: 'sante',
    title: 'Quand consulter, et qui',
    summary: 'Trois niveaux : urgence, consultation rapide, consultation programmée.',
    evidence: 'moyenne',
    blocks: [
      p('Lune t’alerte selon tes saisies, avec trois niveaux. Ces repères ne remplacent pas ton ressenti : en cas de doute, appelle.'),
      hd('Urgence : 15 ou 112'),
      list(
        '**Grossesse extra-utérine possible** : retard de règles ou test positif, avec une douleur dans le bas du ventre, souvent d’un seul côté, avec ou sans saignement (souvent foncé). Signes de gravité : douleur brutale et intense, douleur au bout de l’épaule, vertiges ou malaise. Un saignement n’exclut pas une grossesse extra-utérine.',
        'Saignement abondant avec malaise ou grande faiblesse.',
        'Saignement avec fièvre ; ou fièvre avec douleur pelvienne et pertes anormales ou purulentes (infection possible).',
        'Choc toxique possible sous tampon ou coupe : retire la protection et appelle le 15.',
        'Douleur pelvienne sévère qui s’aggrave malgré les antalgiques.',
        'Idées suicidaires : 3114, ou 15.',
      ),
      hd('Consultation rapide, dans les jours qui suivent'),
      p('Médecin, sage-femme ou centre de santé sexuelle :'),
      list(
        'Test de grossesse négatif mais toujours pas de règles : refais un test quelques jours plus tard, puis consulte si le 2e est négatif.',
        'Saignement entre les règles ou après un rapport : toujours à faire vérifier.',
        'Règles abondantes avec fatigue ou essoufflement (anémie possible).',
        'Fièvre, douleurs ou pertes malodorantes après le retrait du DIU.',
        'Rapport à risque : contraception d’urgence en pharmacie sans attendre et, si un risque de VIH existe, traitement post-exposition (TPE) aux urgences, au mieux dans les 4 h, au plus tard dans les 48 h.',
      ),
      hd('Consultation programmée'),
      p('Médecin traitant, sage-femme ou gynécologue :'),
      list(
        'Pas de règles depuis plus de 3 mois avec un test négatif, y compris après le retrait du DIU.',
        'Au moins 2 cycles sur les 6 derniers de moins de 24 jours ou de plus de 38 jours, ou un cycle de plus de 90 jours.',
        'Écart entre ton cycle le plus court et le plus long de plus de 9 jours (18–25 ans), 7 jours (26–41 ans) ou 9 jours (42–45 ans), calculé sur au moins 6 cycles.',
        'Règles de plus de 8 jours.',
        'Règles abondantes qui pèsent sur ton quotidien, ou score de Higham au-delà de 100.',
        'Douleurs non soulagées par les AINS, qui te font manquer le travail, apparues à l’âge adulte ou qui s’aggravent ; douleurs profondes pendant les rapports ; douleurs digestives ou urinaires pendant les règles.',
        'Symptômes prémenstruels gênants : apporte ton journal de 2 cycles.',
        'Signes de SOPK : cycles de plus de 35 jours à répétition, moins de 8 cycles par an, acné, pilosité.',
        'Phase haute de moins de 10 jours à répétition, si tu as un projet de grossesse (rien d’urgent).',
      ),
      sources(S.ameliGeu, S.nhsGeu, S.nhsBleeding, S.ameliAmenorrhee, S.tpe, S.figo, S.acog760),
    ],
  }),

  article({
    id: 'urgences',
    category: 'sante',
    title: 'Urgences',
    summary: 'Les situations qui ne peuvent pas attendre, et les numéros à appeler.',
    evidence: 'solide',
    blocks: [
      callout('urgent', 'En cas de doute, appelle', 'Le **15** (SAMU) ou le **112** répondent jour et nuit. Mieux vaut appeler pour rien que trop tard.'),
      contact('SAMU'),
      contact('Numéro d’urgence européen'),
      hd('Appelle le 15 ou le 112 si'),
      list(
        'tu as un retard de règles ou un test positif, avec une douleur dans le bas du ventre (souvent d’un côté), un saignement, une douleur au bout de l’épaule, des vertiges ou un malaise ;',
        'tu saignes abondamment avec un malaise ou une grande faiblesse ;',
        'tu saignes avec de la fièvre, ou tu as de la fièvre avec une douleur pelvienne et des pertes anormales ;',
        'tu as une forte fièvre, une éruption ou un malaise brutal en portant un tampon ou une coupe : retire d’abord la protection ;',
        'tu as une douleur pelvienne sévère qui s’aggrave malgré les antalgiques.',
      ),
      hd('Autres numéros'),
      contact('Prévention du suicide'),
      contact('Violences Femmes Info'),
      contact('Police secours'),
      hd('Préservatif rompu ou rapport non protégé'),
      p('Ce n’est pas une urgence vitale, mais le temps compte : contraception d’urgence sans attendre (voir « Contraception d’urgence »), et TPE aux urgences si un risque de VIH existe, au mieux dans les 4 h, au plus tard dans les 48 h.'),
      contact('Sida Info Service'),
      sources(S.ameliGeu, S.nhsGeu, S.ansesSct, S.tpe),
    ],
  }),

  /* ===== Contraception ===== */
  article({
    id: 'efficacite',
    category: 'contraception',
    title: 'Efficacité des contraceptions',
    summary: 'Le tableau de référence, et comment le lire sans se tromper.',
    evidence: 'moyenne',
    blocks: [
      p('Ce tableau donne le pourcentage de femmes qui ont une grossesse non prévue pendant la **première année** d’utilisation. « Usage parfait » : la méthode appliquée sans erreur. « Usage typique » : dans la vraie vie, oublis et erreurs compris.'),
      table(
        ['Méthode', 'Usage parfait', 'Usage typique'],
        [
          ['Aucune méthode', '85', '85'],
          ['Spermicides', '16', '21'],
          ['Préservatif interne', '5', '21'],
          ['Retrait', '4 (simple estimation)', '20'],
          ['Diaphragme', '16', '17'],
          ['Préservatif externe', '2', '13'],
          ['Calendrier / rythme', '–', '15 (19 à l’international)'],
          ['Billings (glaire seule)', '3', '23'],
          ['Standard Days', '5', '13'],
          ['Clue Birth Control', '3', '8'],
          ['Natural Cycles', '– (indice de Pearl FDA : environ 1)', '7'],
          ['**Sensiplan (symptothermie)**', '**0,4**', '**2** (issu d’études cliniques, probablement sous-estimé)'],
          ['Pilule, patch, anneau', '0,3', '7'],
          ['Injectable', '0,2', '4'],
          ['DIU au cuivre', '0,6', '0,8'],
          ['DIU au lévonorgestrel', '0,3', '0,4'],
          ['Implant', '0,1', '0,1'],
        ],
      ),
      p('Source : Contraceptive Technology, 22e édition (2023), tableau 5-2.'),
      hd('Comment lire ces chiffres'),
      list(
        'Ce sont des pourcentages sur un an, calculés avec des tables de survie : ils ne se comparent pas directement à un « indice de Pearl ».',
        'Le chiffre de Sensiplan en usage typique vient d’études cliniques : il **sous-estime probablement** la réalité, et les auteurs le disent eux-mêmes.',
        'Ces chiffres valent pour une méthode apprise et bien appliquée. Une app maison comme Lune ne peut pas revendiquer l’efficacité de Sensiplan.',
        'Ils n’ont pas été démontrés pour les premiers cycles après une contraception hormonale.',
        'Des sites français reprennent une édition plus ancienne (2011) et donnent d’autres valeurs : regarde toujours la source et la date.',
        'L’OMS (2022) n’a pas de taux fiable pour le calendrier ni pour la température seule. Pour la symptothermie, elle donne moins de 1 % en usage parfait et 2 % en usage typique.',
      ),
      callout('info', 'Dans la vraie vie de la méthode', 'Dans l’étude de référence (Frank-Herrmann 2007), le préservatif pendant la phase fertile donnait 0,59 grossesse pour 100 femmes en 13 cycles, l’abstinence 0,43, et les rapports non protégés en phase fertile 7,46. Ce qui compte le plus : respecter chaque jour fertile.'),
      p('Natural Cycles : 6,5 % en usage typique selon la FDA, et **8,6 %** chez les femmes qui avaient pris une contraception hormonale dans les 60 jours précédents, contre 5,0 % sans contraception hormonale depuis 12 mois.'),
      sources(S.ct22, S.guttmacher, S.who, S.frank2007, S.fdaNC),
    ],
  }),

  article({
    id: 'preservatif',
    category: 'contraception',
    title: 'Bien utiliser le préservatif',
    summary: 'La liste de contrôle, la bonne taille, la gratuité et que faire s’il rompt.',
    evidence: 'solide',
    blocks: [
      p('Pendant les premiers cycles, tu vas sans doute utiliser souvent le préservatif. Bien utilisé, il est efficace : 2 % de grossesses la première année en usage parfait, 13 % en usage typique. L’écart vient surtout des erreurs d’utilisation.'),
      hd('Liste de contrôle'),
      steps(
        '**Vérifie** la date de péremption, l’emballage intact et le marquage **CE** ou **NF**. Jette un préservatif sec, cassant, collant ou décoloré. Ne le garde pas dans un portefeuille.',
        '**Ouvre** l’emballage sans les dents, sans les ongles et sans ciseaux.',
        '**Pose-le avant tout contact génital**, sur le pénis en érection, en pinçant le réservoir. Le liquide qui précède l’éjaculation peut contenir des spermatozoïdes mobiles : c’était le cas chez 37 % des participants d’une étude citée par Contraceptive Technology.',
        '**Déroule-le jusqu’à la base.** S’il est à l’envers, jette-le et prends-en un neuf.',
        '**Lubrifiant à l’eau ou au silicone.** Jamais de corps gras avec le latex : huile, vaseline, crème, beurre. Trop de lubrifiant à l’intérieur le fait glisser.',
        '**Retire-le juste après l’éjaculation**, pénis encore en érection, en tenant l’anneau à la base. Fais un nœud et jette-le à la poubelle.',
        '**Jamais** de réutilisation, jamais deux préservatifs l’un sur l’autre, jamais un externe avec un interne.',
      ),
      hd('La bonne taille'),
      p('La « largeur nominale » indiquée sur la boîte est la largeur du préservatif à plat : un peu moins de la moitié du tour du pénis en érection. Repères commerciaux, indicatifs :'),
      table(
        ['Tour du pénis en érection', 'Largeur nominale'],
        [
          ['100 à 110 mm', 'moins de 52 mm'],
          ['110 à 120 mm', '52 à 54 mm'],
          ['120 à 135 mm', '55 à 60 mm'],
        ],
      ),
      hd('Le préservatif interne'),
      list(
        'Les modèles en nitrile ou en polyuréthane acceptent tous les lubrifiants, mais certains sont en latex : vérifie la notice.',
        'Il peut être mis en place quelques heures avant le rapport.',
        'Ne l’associe pas à un préservatif externe.',
      ),
      p('**Allergie au latex** : choisis un modèle en polyuréthane, polyisoprène ou nitrile (par exemple Manix Sensitivity).'),
      hd('Gratuit avant 26 ans'),
      list(
        'En pharmacie, **sans ordonnance** : préservatifs externes depuis le 1er janvier 2023, internes depuis le 9 janvier 2024.',
        '**Une boîte par délivrance** (décret du 18 février 2026).',
        'Présente ta carte Vitale ou ton attestation.',
        'Des préservatifs gratuits sont aussi disponibles dans les centres de santé sexuelle et les CeGIDD.',
      ),
      p('Marques concernées selon la liste ameli du 27 juillet 2026 :'),
      list(
        'Externes : Be Loved, Eden, Eden Perlés, Manix Classic, Manix Sensitivity (sans latex), Soft, Sortez couverts !, Sure & Smile.',
        'Internes : Be Loved free, Ormelle, So sexy & Smile.',
      ),
      callout('info', 'Liste datée', 'D’autres sources (Vidal, février 2026) citent d’autres références. La liste peut changer : vérifie en pharmacie.'),
      hd('S’il rompt ou glisse'),
      p('Environ 2 % des préservatifs cassent, se déchirent ou glissent, surtout à cause d’erreurs d’utilisation. Le bouton **Urgence** de Lune te guide pas à pas :'),
      steps(
        '**Contraception d’urgence**, le plus vite possible (voir « Contraception d’urgence »).',
        'Si le statut VIH de ton partenaire est inconnu ou positif : **traitement post-exposition (TPE)** aux urgences, au mieux dans les 4 h, au plus tard dans les 48 h. Pour un couple exclusif dont les deux partenaires ont été dépistés, ce n’est pas nécessaire.',
        '**Dépistage des IST** : « Mon test IST » (gonocoque, chlamydia, syphilis, hépatite B) est gratuit et sans ordonnance en laboratoire avant 26 ans. Le test du VIH (« VIH Test ») est sans ordonnance et pris en charge à 100 %, à tout âge.',
        '**Test de grossesse** 21 jours après le rapport.',
        'Si tu prends une contraception d’urgence et la notes dans Lune, le cycle reste **fertile jusqu’aux prochaines règles**.',
      ),
      sources(S.ct22, S.who, S.cdcCondom, S.santeCondom, S.fc2, S.condomSize, S.ameliContra, S.vidalCondom, S.monTestIst),
    ],
  }),

  article({
    id: 'contraception-urgence',
    category: 'contraception',
    title: 'Contraception d’urgence',
    summary: 'Les délais, la méthode la plus efficace, la gratuité et ce qu’il faut faire après.',
    evidence: 'solide',
    blocks: [
      callout('urgent', 'Le temps compte', 'Après un rapport non protégé ou un incident de préservatif, un jour qui n’est pas infertile : agis **le plus vite possible**. Le bouton **Urgence** de Lune calcule les délais à partir de l’heure du rapport.'),
      hd('Les 3 options, de la plus efficace à la moins efficace'),
      table(
        ['', 'DIU au cuivre', 'Ulipristal 30 mg', 'Lévonorgestrel 1,5 mg'],
        [
          ['Délai', 'jusqu’à 120 h (5 jours) après le **premier** rapport non protégé du cycle', 'jusqu’à 120 h (5 jours)', 'jusqu’à 72 h (3 jours), de préférence dans les 12 h'],
          ['Efficacité', 'la plus efficace : moins de 0,1 % de grossesses', 'environ 1 à 2 % de grossesses', 'environ 0,6 à 2,6 % ; moins efficace à mesure qu’on attend'],
          ['Où', 'prescription et pose : médecin, sage-femme, centre de santé sexuelle', 'pharmacie, sans ordonnance', 'pharmacie, sans ordonnance'],
          ['Prix', '30,50 € ; pris en charge à 100 % avant 26 ans, 65 % ensuite', 'gratuite pour toutes depuis 2023', 'gratuite pour toutes depuis 2023'],
        ],
      ),
      p(TEXTS.emergency.order),
      p('Cet ordre ne dépend pas de la phase estimée de ton cycle, qui peut être fausse. L’ulipristal reste efficace un peu plus tard que le lévonorgestrel : il peut retarder l’ovulation même après le début du pic de LH (mais pas au pic ni après). Le lévonorgestrel, lui, n’agit plus une fois le pic de LH commencé.'),
      hd('Bon à savoir sur les délais'),
      list(
        'Le lévonorgestrel pris au 5e jour expose à un risque de grossesse environ 5,8 fois plus élevé qu’au 1er jour. Entre 72 et 96 h, il est utilisé hors autorisation ; au-delà de 96 h, il est inefficace.',
        'Une pilule ne couvre que les rapports des 120 dernières heures. Le délai du DIU part du **premier** rapport non protégé du cycle : note donc tous les rapports non protégés depuis tes dernières règles (ou depuis le retrait).',
        'Si un rapport non protégé date de plus de 21 jours sans règles depuis, ou si tes règles sont en retard : fais un test de grossesse **avant** la contraception d’urgence.',
        'Au-delà de 120 h, une professionnelle peut parfois encore poser un DIU : appelle sans attendre.',
      ),
      hd('Situations particulières'),
      list(
        '**DIU hormonal retiré il y a moins de 7 jours** : un progestatif pris dans les 7 jours avant l’ulipristal pourrait réduire son efficacité. Le lévonorgestrel ou le DIU au cuivre peuvent être préférés : demande conseil.',
        '**Lévonorgestrel dans les 5 jours après l’ulipristal** : il pourrait réduire l’efficacité de l’ulipristal.',
        '**Poids** : selon la recommandation britannique, le lévonorgestrel pourrait être moins efficace au-delà de 70 kg (ou d’un IMC de 26), et l’ulipristal au-delà de 85 kg (ou d’un IMC de 30). L’agence européenne et la HAS jugent les données non concluantes : les pilules restent utilisables quel que soit le poids. Le DIU au cuivre est alors d’autant plus conseillé.',
        '**Médicaments inducteurs enzymatiques**, même pris dans les 4 dernières semaines : DIU au cuivre, ou double dose de lévonorgestrel (3 mg). Demande au pharmacien si un de tes traitements est concerné.',
        '**Asthme sévère traité par corticoïdes en comprimés** : l’ulipristal est déconseillé.',
      ),
      hd('Après la prise'),
      list(...TEXTS.emergency.after),
      p('Tes règles suivantes peuvent être décalées : après l’ulipristal, 18,5 % des femmes ont plus de 7 jours de retard.'),
      contact('Numéro vert « Sexualités, contraception, IVG »'),
      sources(S.fsrhEc, S.hasCu, S.spCu, S.ameliCu, S.ameliCuReflexes, S.ellaone, S.emaPoids),
    ],
  }),

  article({
    id: 'test-grossesse',
    category: 'contraception',
    title: 'Test de grossesse : quand le faire',
    summary: 'Pourquoi 21 jours, comment lire le résultat, et ce que fait Lune.',
    evidence: 'solide',
    blocks: [
      p('Un test urinaire détecte l’hormone hCG, produite après l’implantation de l’embryon dans l’utérus. L’implantation a lieu au plus tôt 6 jours après l’ovulation, et dans plus de 80 % des cas entre 8 et 10 jours après.'),
      callout('attention', 'La règle des 21 jours', 'Un test fait **moins de 21 jours** après un rapport non protégé **ne peut pas exclure** une grossesse. Un test urinaire négatif fait **21 jours ou plus** après le dernier rapport non protégé l’exclut.'),
      hd('Quand Lune te le rappelle'),
      list(
        'À la première de ces deux dates : **5 jours après la date de règles attendue** (seulement si elle est fiable), ou **21 jours après le dernier rapport non protégé**.',
        'Chaque nouveau rapport non protégé repousse la date des 21 jours.',
        'Un test négatif fait avant 21 jours est « non concluant » : Lune te rappelle de refaire un test à 21 jours.',
        'Le rappel s’arrête avec de vraies règles confirmées, ou un test négatif fait à 21 jours ou plus.',
        'Pendant le cycle 0, le cycle 1 ou un cycle avec contraception d’urgence, il n’y a pas de date de règles fiable : seul le rappel à 21 jours compte.',
        'Règles anormalement légères ou douleurs inhabituelles : fais un test tout de suite.',
        'Phase haute de 19 jours ou plus, ou pas de règles depuis 42 jours : fais un test.',
      ),
      hd('Lire le résultat'),
      list(
        '**Positif** : un test positif est presque toujours juste. Tu peux utiliser l’urine de n’importe quel moment de la journée.',
        '**Négatif sans règles** : refais un test 3 à 7 jours plus tard, puis consulte s’il reste négatif.',
        'Les tests ne se valent pas : les plus sensibles détectent environ 20 mUI/mL. En 2004, une étude montrait qu’un test à 100 mUI/mL ne repérait qu’environ 16 % des grossesses au 1er jour de retard.',
        'La prise de sang (bêta-hCG) est plus sensible que le test urinaire.',
      ),
      callout('urgent', 'Test positif avec douleur ou saignement', `Douleur dans le bas du ventre (souvent d’un côté), saignement, douleur au bout de l’épaule, vertiges ou malaise : ${URGENT_15} Ce peut être une grossesse extra-utérine.`),
      sources(S.fsrhEc, S.nhsTest, S.cole, S.ameliCuReflexes, S.hasCu),
    ],
  }),

  article({
    id: 'test-positif',
    category: 'contraception',
    title: 'Test positif : et maintenant ?',
    summary: 'Des repères neutres pour la suite, quelle que soit ta décision.',
    evidence: null,
    blocks: [
      p('Un test positif peut soulever beaucoup de questions. Voici des repères pour la suite, quelle que soit ta décision. Tu peux en parler à des professionnelles, gratuitement et anonymement.'),
      callout('urgent', 'D’abord, les signes d’urgence', `Douleur dans le bas du ventre, souvent d’un côté, saignement, douleur au bout de l’épaule, vertiges ou malaise : ${URGENT_15} Une grossesse extra-utérine est possible, et un saignement ne l’exclut pas.`),
      hd('Confirmer et dater'),
      p('Un médecin, une sage-femme ou un centre de santé sexuelle peut confirmer la grossesse et estimer son terme. C’est utile quelle que soit ta décision.'),
      hd('Si tu envisages une IVG'),
      list(
        '**IVG médicamenteuse** : jusqu’à la fin de la 7e semaine de grossesse, soit 9 semaines après le début des dernières règles.',
        '**IVG instrumentale** : jusqu’à la fin de la 14e semaine de grossesse, soit 16 semaines après le début des dernières règles.',
        'Prise en charge à **100 %**, sans délai de réflexion imposé.',
        'La liberté de recourir à l’IVG est inscrite dans la Constitution (loi constitutionnelle n° 2024-200 ; information issue d’une source secondaire).',
        'Les sages-femmes, les médecins et les centres de santé sexuelle peuvent t’accompagner.',
      ),
      hd('Si tu envisages de poursuivre la grossesse'),
      p('Prends rendez-vous avec un médecin ou une sage-femme pour commencer le suivi.'),
      hd('Pour en parler'),
      contact('Numéro vert « Sexualités, contraception, IVG »'),
      contact('Site officiel IVG'),
      contact('Planning familial'),
      sources(S.ivg, S.ivgGouv, S.ameliGeu),
    ],
  }),

  /* ===== Ressources ===== */
  article({
    id: 'ressources',
    category: 'ressources',
    title: 'Ressources en France',
    summary: 'Numéros, sites et lieux pour t’informer ou te faire aider.',
    evidence: null,
    blocks: [
      callout('info', `Vérifié le ${frDate(RESOURCES_CHECKED_AT)}`, 'Horaires et coordonnées peuvent changer : vérifie-les avant de te déplacer.'),
      hd('Urgences'),
      contact('SAMU'),
      contact('Numéro d’urgence européen'),
      contact('Prévention du suicide'),
      contact('Violences Femmes Info'),
      contact('Police secours'),
      hd('Contraception, IVG, sexualité'),
      contact('Numéro vert « Sexualités, contraception, IVG »'),
      contact('Planning familial'),
      contact('QuestionSexualité (Santé publique France)'),
      contact('Site officiel IVG'),
      contact('Centres de santé sexuelle'),
      contact('CeGIDD'),
      contact('Sages-femmes'),
      contact('Fil Santé Jeunes'),
      contact('Sida Info Service'),
      hd('Endométriose'),
      contact('EndoFrance'),
      contact('ENDOmind'),
      hd('La méthode'),
      contact('Sensiplan'),
      hd('Tes droits'),
      list(
        'Contraception sans avance de frais avant 26 ans (consultations, DIU, implant, pose et retrait…), prise en charge à 65 % ensuite.',
        'Contraception d’urgence hormonale gratuite pour toutes, en pharmacie.',
        'Préservatifs gratuits avant 26 ans, en pharmacie.',
      ),
      sources(S.ameliContra),
    ],
  }),
]

/** « 2026-10-04 » → « 4 octobre 2026 » (sans dépendre de l'Intl de l'appareil). */
function frDate(iso) {
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

const BY_ID = new Map(ARTICLES.map((a) => [a.id, a]))

/**
 * Renvoie l'article d'identifiant `id`, ou null s'il n'existe pas.
 * @param {string} id
 * @returns {object|null}
 */
export function getArticle(id) {
  return BY_ID.get(id) || null
}
