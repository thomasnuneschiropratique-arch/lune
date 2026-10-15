/**
 * Conseils par phase, glossaire, textes réutilisables et ressources de « Lune ».
 * Contenu fondé exclusivement sur docs/spec-medicale.md (v1.0 du 2026-10-04).
 * Chaînes : **gras** seulement (rendu via richText), aucune balise HTML.
 */

/** Conseils courts par phase (affichés sur l'écran Aujourd'hui). */
export const PHASE_TIPS = {
  regles: [
    'Seules de vraies règles démarrent un cycle : confirme-les quand Lune te le demande. Un spotting ne compte jamais comme J1.',
    'Continue la température chaque matin pendant les règles : ces valeurs servent de valeurs basses.',
    'Crampes : un anti-inflammatoire (AINS) pris dès le début de la douleur soulage environ une femme sur deux. Demande au pharmacien s’il te convient.',
    'La chaleur (bouillotte) soulage au moins autant que les antalgiques, d’après de petits essais.',
    'Tampon ou coupe : **6 h maximum**, et une protection externe la nuit.',
    'Protection changée toutes les 1 à 2 h, caillots de plus de 2,5 cm ou règles de plus de 8 jours : parles-en à un médecin.',
    'Après un retrait de DIU, tes règles peuvent changer d’abondance ou de douleur : note-les pour établir ta nouvelle référence.',
    'Fièvre élevée, éruption et malaise brutal avec un tampon ou une coupe : retire la protection et appelle le **15**.',
  ],
  folliculaire: [
    'Observe ta glaire plusieurs fois par jour, idéalement avant d’uriner, et note la meilleure qualité de la journée.',
    'Un jour sans observation reste « inconnu », donc fertile : il n’est jamais compté comme sec.',
    'La glaire augmente pendant les 5 à 6 jours qui précèdent l’ovulation : c’est le signe que la fenêtre fertile s’ouvre.',
    'Cette phase est la plus variable du cycle : stress, maladie ou voyage peuvent retarder l’ovulation.',
    'Les spermatozoïdes peuvent survivre jusqu’à 7 jours : un rapport plusieurs jours avant l’ovulation peut suffire.',
    'Mesure ta température au réveil, avant de te lever, avec la même voie et le même thermomètre tout le cycle.',
    'Alcool, nuit courte, maladie : note la perturbation le jour même, avec la valeur.',
  ],
  ovulatoire: [
    'Glaire mouillée, glissante ou filante comme du blanc d’œuf : c’est la qualité la plus fertile (S+).',
    'Une douleur d’un seul côté, de quelques minutes à 1 ou 2 jours, peut accompagner l’ovulation.',
    'Un test LH positif annonce une ovulation probable dans les 24 à 48 h. Un test négatif ne veut jamais dire infertile.',
    'La libido est souvent plus élevée autour de l’ovulation : garde des préservatifs à portée de main.',
    'Le jour sommet ne se reconnaît qu’après coup, quand 3 jours de glaire moins fertile ont suivi.',
    'Continue à noter ta glaire chaque jour : un seul jour manquant après le sommet bloque la fin de la phase fertile.',
  ],
  luteale: [
    'Après l’ovulation, la progestérone fait monter la température de 0,2 à 0,5 °C.',
    'La phase infertile ne commence qu’avec le double contrôle confirmé, à 18 h le jour de bascule.',
    'Seins sensibles, ballonnements, fatigue ou humeur plus basse sont fréquents en fin de cycle.',
    'Des symptômes gênants avant les règles ? Note-les chaque jour pendant 2 cycles pour en parler à un médecin.',
    'Contre le syndrome prémenstruel, l’activité physique, le calcium et les thérapies cognitives et comportementales sont recommandés ; pour la vitamine B6 et le gattilier, les preuves sont insuffisantes.',
    'Phase haute de 19 jours sans règles : fais un test de grossesse.',
    'Idées noires ou suicidaires : appelle le **3114**.',
  ],
  inconnue: [
    'Pas assez de données pour situer la phase : considère chaque jour comme fertile.',
    'Mesure ta température chaque matin, même après un oubli : chaque valeur compte.',
    'Note ta glaire chaque jour, même « sec » ou « rien » : un jour vide reste inconnu.',
    'Saignement : précise s’il s’agit de règles, de spotting ou d’un saignement post-retrait.',
    'Après un retrait de DIU, beaucoup de jours à protéger, c’est attendu.',
    'Exporte une sauvegarde chaque semaine : tes données ne sont que sur ce téléphone.',
  ],
}

/** Glossaire (termes techniques expliqués simplement). */
export const GLOSSARY = [
  { term: 'Aménorrhée', definition: 'Absence de règles. On parle d’aménorrhée secondaire quand les règles s’arrêtent plus de 3 mois chez une femme qui les avait.' },
  { term: 'AINS', definition: 'Anti-inflammatoires non stéroïdiens, comme l’ibuprofène. Ils soulagent les douleurs de règles mieux qu’un placebo, et probablement mieux que le paracétamol. Jamais deux AINS ensemble.' },
  { term: 'Arrondi à 0,05', definition: 'Avant toute comparaison, chaque température est arrondie au 0,05 °C le plus proche : 36,22 devient 36,20, 36,23 devient 36,25.' },
  { term: 'Cas limite', definition: 'Montée de température tout juste suffisante après arrondi. Attendre 1 à 2 jours de plus est prudent.' },
  { term: 'CeGIDD', definition: 'Centre gratuit d’information, de dépistage et de diagnostic des IST : dépistage gratuit, préservatifs, contraception d’urgence.' },
  { term: 'Centre de santé sexuelle', definition: 'Ancien CPEF (centre de planification). Contraception, contraception d’urgence, préservatifs, dépistage ; gratuit et anonyme pour les mineures et les personnes sans couverture sociale.' },
  { term: 'Col de l’utérus', definition: 'Partie basse de l’utérus, au fond du vagin. Il produit la glaire et change d’ouverture et de fermeté au fil du cycle. Dans Lune, il peut remplacer la glaire comme second signe.' },
  { term: 'Corps jaune', definition: 'Ce qui reste du follicule après l’ovulation. Il produit la progestérone et l’œstradiol pendant la phase lutéale.' },
  { term: 'CU', definition: 'Contraception d’urgence : DIU au cuivre (jusqu’à 120 h), ulipristal (jusqu’à 120 h) ou lévonorgestrel (jusqu’à 72 h) après un rapport non protégé.' },
  { term: 'Cycle 0', definition: 'Période qui va du retrait du DIU (ou du début du suivi) jusqu’aux premières vraies règles. Son début réel est inconnu : il est entièrement protégé.' },
  { term: 'Cycle d’apprentissage', definition: 'Les 3 premiers cycles après le retrait. Lune calcule l’évaluation pour que tu apprennes, mais recommande de te protéger chaque jour.' },
  { term: 'DIU', definition: 'Dispositif intra-utérin, ou stérilet. Au cuivre (sans hormone) ou au lévonorgestrel (hormonal : Mirena, Kyleena, Jaydess, Donasert).' },
  { term: 'Double contrôle', definition: 'Principe de la méthode : la phase infertile après l’ovulation n’est déclarée que si la montée de température ET le critère de glaire (ou de col) sont tous deux remplis.' },
  { term: 'Endomètre', definition: 'Muqueuse qui tapisse l’intérieur de l’utérus. Elle s’épaissit pendant le cycle et s’élimine pendant les règles.' },
  { term: 'Exclusion', definition: 'Valeur de température mise de côté parce qu’elle a été perturbée vers le haut (maladie, alcool…). Toujours avec un motif, et seulement avant la confirmation de la montée.' },
  { term: 'FHM', definition: 'Première valeur haute : la première température plus haute que les 6 valeurs qui la précèdent. Elle marque le début possible de la montée.' },
  { term: 'FIGO', definition: 'Fédération internationale de gynécologie et d’obstétrique. Ses repères (2018) : cycle normal de 24 à 38 jours, règles de 8 jours au plus.' },
  { term: 'Fenêtre fertile', definition: 'Les jours où un rapport peut mener à une grossesse : environ 6 jours qui se terminent le jour de l’ovulation.' },
  { term: 'Glaire cervicale', definition: 'Sécrétion produite par le col de l’utérus. Sous l’effet des œstrogènes, elle devient plus humide, plus filante et plus glissante avant l’ovulation.' },
  { term: 'Glaire t, ∅, f', definition: 't : sensation sèche ou rêche, rien vu. ∅ : rien senti, rien vu. f : sensation humide, rien vu. t et ∅ sont les qualités les moins fertiles ; f est déjà un signe que la phase fertile a commencé.' },
  { term: 'Glaire S', definition: 'Glaire visible épaisse, blanchâtre, trouble, crémeuse, laiteuse, collante ou grumeleuse, non étirable.' },
  { term: 'Glaire S+', definition: 'La qualité la plus fertile : glaire transparente, filante, étirable comme du blanc d’œuf cru, liquide ou rougeâtre, OU sensation mouillée, glissante, même sans rien voir.' },
  { term: 'IST', definition: 'Infections sexuellement transmissibles (chlamydia, gonocoque, syphilis, hépatite B, VIH…).' },
  { term: 'J1', definition: 'Premier jour du cycle : le premier jour de vraies règles, d’abondance habituelle, confirmé par toi. Ni un spotting ni un saignement post-retrait.' },
  { term: 'Jour de cycle', definition: 'Numéro du jour depuis le J1 : le lendemain du J1 est le J2, et ainsi de suite.' },
  { term: 'Jour sommet', definition: 'Dernier jour de ta meilleure qualité de glaire du cycle, suivi de 3 jours de qualité inférieure. On ne le reconnaît qu’après coup.' },
  { term: 'LH', definition: 'Hormone lutéinisante. Son pic déclenche l’ovulation. Les tests d’ovulation la détectent dans l’urine.' },
  { term: 'Ligne auxiliaire', definition: 'La plus haute des 6 valeurs basses qui précèdent la première valeur haute. Les valeurs suivantes doivent la dépasser pour confirmer la montée.' },
  { term: 'Mode strict FSRH', definition: 'Option : protection tous les jours jusqu’à ce que 3 cycles après le retrait soient passés et que tes cycles soient réguliers selon la FIGO. Conseillée après un DIU hormonal ou de type inconnu.' },
  { term: 'Œstradiol', definition: 'Principal œstrogène. Il monte avant l’ovulation et rend la glaire plus fertile.' },
  { term: 'Ovulation', definition: 'Libération d’un ovocyte par l’un des ovaires, au hasard. L’ovocyte ne vit que peu de temps.' },
  { term: 'Phase folliculaire', definition: 'Du début des règles à l’ovulation. C’est la phase la plus variable : 10 à 30 jours pour 95 % des cycles.' },
  { term: 'Phase haute', definition: 'Jours de température haute, de la première valeur haute jusqu’à la veille des règles suivantes.' },
  { term: 'Phase lutéale', definition: 'De l’ovulation aux règles suivantes. Elle dure en moyenne 12,4 jours quand on la mesure par la température, mais varie d’une femme à l’autre.' },
  { term: 'Progestérone', definition: 'Hormone produite par le corps jaune après l’ovulation. Elle fait monter la température au réveil.' },
  { term: 'Règle des 3 sur 6', definition: 'La montée de température est confirmée par 3 valeurs consécutives plus hautes que les 6 précédentes, la 3e dépassant la ligne auxiliaire d’au moins 0,20 °C.' },
  { term: 'Règle des 5 jours / moins 8', definition: 'Règle de début de cycle : 5 jours infertiles, ou le jour de ta montée la plus précoce moins 8. Désactivée par défaut dans Lune.' },
  { term: 'RNP', definition: 'Rapport non protégé : rapport sans préservatif, ou avec un incident de préservatif (rupture, glissement).' },
  { term: 'SA (semaines d’aménorrhée)', definition: 'Durée de grossesse comptée depuis le premier jour des dernières règles. 9 SA correspondent à la fin de la 7e semaine de grossesse.' },
  { term: 'Saignement post-retrait', definition: 'Saignement provoqué par le retrait du DIU. Il ne démarre pas un cycle et gêne l’observation de la glaire.' },
  { term: 'Sensiplan', definition: 'Méthode symptothermique de l’AG NFP (Allemagne). Lune s’en inspire sans pouvoir revendiquer son efficacité.' },
  { term: 'SOPK', definition: 'Syndrome des ovaires polykystiques : excès d’androgènes, ovulation irrégulière et/ou ovaires polykystiques. Touche 10 à 13 % des femmes.' },
  { term: 'SPM', definition: 'Syndrome prémenstruel : symptômes qui reviennent la semaine avant les règles et disparaissent au début ou juste après.' },
  { term: 'Spotting', definition: 'Petit saignement léger. Il ne démarre jamais un cycle. En dehors des règles, il compte comme une glaire S+.' },
  { term: 'Symptothermie', definition: 'Méthode qui combine la température au réveil et un second signe (glaire ou col) pour repérer la phase fertile.' },
  { term: 'TDPM', definition: 'Trouble dysphorique prémenstruel : forme sévère du SPM, centrée sur l’humeur.' },
  { term: 'TPE', definition: 'Traitement post-exposition au VIH, à commencer aux urgences au mieux dans les 4 h, au plus tard dans les 48 h après un rapport à risque.' },
  { term: 'Usage parfait / typique', definition: 'Usage parfait : la méthode appliquée sans aucune erreur. Usage typique : dans la vraie vie, oublis et erreurs compris.' },
  { term: 'Valeur post-hormonale', definition: 'Après un DIU hormonal (ou de type inconnu), Lune exige une valeur haute de plus pour confirmer la montée, jusqu’au premier cycle où une montée est confirmée (ce cycle compris). Désactivée par défaut pour un DIU au cuivre.' },
]

const REMOVAL_COMMON = [
  'Ta fertilité revient **immédiatement** : une grossesse est possible dès le jour du retrait.',
  'Lune considère chaque jour comme fertile dès le retrait, sans période de transition.',
  'Un rapport non protégé dans les 7 jours avant le retrait peut mener à une grossesse : signale-le à la professionnelle **avant** le retrait.',
  'Commence à mesurer ta température tout de suite : il faut au moins 6 valeurs basses avant de pouvoir repérer une montée.',
  'Le saignement provoqué par le retrait ne démarre pas un cycle : note-le « saignement post-retrait ».',
  'Pendant les premiers cycles, il faudra protéger la plupart des jours. C’est attendu.',
]

/** Textes réutilisables (avertissements, efficacité, après-retrait, contraception d'urgence). */
export const TEXTS = {
  disclaimerShort:
    'Lune n’est pas un dispositif médical et son algorithme n’a été validé par aucune étude. Elle t’aide à appliquer des règles ; elle ne remplace ni une formation à la méthode, ni un avis médical.',
  disclaimerLong: [
    'Lune est un **outil de documentation** : température, glaire ou col, saignements, symptômes, rapports et tests. Elle t’aide à appliquer les règles de la méthode symptothermique à double contrôle, inspirées de Sensiplan.',
    '**Ce n’est pas un dispositif médical, et son algorithme n’a été validé par aucune étude.** Une app maison ne peut pas revendiquer l’efficacité de Sensiplan. Les règles utilisées n’ont été relues ni par un professionnel de santé, ni par une conseillère Sensiplan : fais-les vérifier par une conseillère avant de t’en servir comme contraception.',
    'La recommandation allemande S2k (2024) déconseille de recommander comme contraception fiable les apps fondées principalement sur la température. Elles peuvent servir à documenter son cycle.',
    'Lune ne remplace ni une formation à la méthode avec une conseillère certifiée, ni un avis médical.',
    'Les prévisions (prochaines règles, ovulation, fenêtre fertile estimée) sont **indicatives**. Elles ne rendent jamais un jour infertile.',
    'Toutes tes données restent sur ton téléphone : aucun compte, aucune analytique, aucun envoi. En contrepartie, toi seule peux les sauvegarder : exporte-les régulièrement.',
  ],
  effectiveness: {
    head: ['Méthode ou situation', 'Grossesses non prévues pour 100 femmes (sur 1 an ou 13 cycles)', 'Source'],
    rows: [
      ['Symptothermie Sensiplan, usage global (femmes formées)', '1,8', 'Frank-Herrmann 2007'],
      ['Sensiplan, abstinence pendant la phase fertile', '0,43', 'Frank-Herrmann 2007'],
      ['Sensiplan, préservatif pendant la phase fertile', '0,59', 'Frank-Herrmann 2007'],
      ['Sensiplan, rapports non protégés pendant la phase fertile', '7,46', 'Frank-Herrmann 2007'],
      ['Sensiplan (synthèse)', '0,4 en usage parfait · 2 en usage typique', 'Contraceptive Technology 2023'],
      ['Natural Cycles (température + algorithme), usage typique', '6,5 · 8,6 après une contraception hormonale récente', 'FDA'],
      ['Température seule, rapports seulement après l’ovulation', '6,6', 'FSRH 2015 (document historique)'],
      ['Calendrier (Ogino)', 'environ 15 à 20', 'Contraceptive Technology 2023 ; FSRH 2015'],
      ['Préservatif externe seul', '2 en usage parfait · 13 en usage typique', 'Contraceptive Technology 2023'],
      ['Aucune méthode', '85', 'Contraceptive Technology 2023'],
    ],
  },
  removalCommon: REMOVAL_COMMON,
  removalCopper: [
    'Le cuivre agit dans l’utérus sans toucher aux hormones : tu as continué d’ovuler normalement pendant toute la durée du DIU.',
    'Ton cycle naturel continue tel quel. **L’ovulation suivante peut tomber dans les jours qui suivent le retrait.**',
    'Tes règles devraient arriver à leur date naturelle.',
    'Sous cuivre, les règles sont souvent plus longues, plus abondantes ou plus douloureuses (étude Bateson, à 12 mois : 35 % de règles de plus de 7 jours, 43 % de douleurs accrues, 43 % de règles abondantes). Un retour à ton profil d’avant la pose est probable, mais aucune étude ne l’a mesuré après un retrait.',
    'Tu vas établir une **nouvelle référence** : durée, abondance et douleur de tes règles.',
  ],
  removalHormonal: [
    '**La plupart des femmes ovulent déjà sous DIU hormonal.** Avec un DIU à 52 mg (Mirena, Donasert) : 76,5 % des femmes la 1re année, 85 % la 2e, 98 % la 3e. À 19,5 mg (Kyleena) : 88,5 %, 95 % puis 100 % (Apter 2014). Mesurée en cycles et non en femmes, la notice FDA de Mirena donne environ 45 % de cycles avec ovulation la 1re année.',
    'Ne pas avoir de règles sous DIU hormonal **ne prouve pas** l’absence d’ovulation. Une ovulation est possible quelques jours ou quelques semaines après le retrait.',
    'Retour des règles après un DIU à 52 mg (étude ACCESS IUS, 16–35 ans) : 74,1 % au 1er mois, 95,3 % à 2 mois, 97,6 % à 3 mois. Chez les 36–45 ans : 45,8 % au 1er mois, 77,1 % à 2 mois.',
    'Les premiers cycles peuvent être **longs ou sans ovulation**. Le retour à une fertilité habituelle prendrait environ 2 cycles (Yland 2020).',
    'Tes règles vont probablement redevenir plus abondantes et plus douloureuses qu’avec le DIU. Si ton DIU avait été posé pour des règles abondantes, une endométriose ou une adénomyose, ces symptômes peuvent revenir : surveille l’abondance et la douleur.',
    'L’acné, la tension des seins et les variations d’humeur ou de libido liées au lévonorgestrel devraient régresser. C’est une déduction logique : aucune étude ne l’a mesuré après un retrait.',
    'Le « Mirena crash » n’est pas un terme médical : aucune étude n’a établi de syndrome propre au retrait. Si ton humeur te pèse, consulte. En cas d’idées suicidaires, appelle le **3114**.',
  ],
  why7days:
    'Les spermatozoïdes peuvent survivre plusieurs jours dans le corps (jusqu’à 7 jours selon le NHS). Un rapport non protégé dans les 7 jours qui précèdent le retrait peut donc mener à une grossesse une fois le DIU retiré. Sans projet de grossesse, la recommandation britannique FSRH (2023) conseille d’éviter tout rapport non protégé pendant ces 7 jours, sans exception.',
  emergency: {
    order:
      'Ordre conseillé, quelle que soit la phase du cycle : **DIU au cuivre** (le plus efficace), puis **ulipristal 30 mg**, puis **lévonorgestrel 1,5 mg**.',
    delays: [
      '**DIU au cuivre** : jusqu’à 120 h (5 jours) après le **premier** rapport non protégé du cycle. Prescription et pose par un médecin, une sage-femme ou un centre de santé sexuelle.',
      '**Ulipristal 30 mg** : jusqu’à 120 h (5 jours) après le rapport. En pharmacie, gratuit et sans ordonnance.',
      '**Lévonorgestrel 1,5 mg** : jusqu’à 72 h (3 jours), de préférence dans les 12 h. En pharmacie, gratuit et sans ordonnance. Au-delà de 96 h, il est inefficace.',
      'Au-delà de 120 h, une professionnelle peut parfois encore poser un DIU : appelle sans attendre.',
    ],
    after: [
      '**Préservatif à chaque rapport jusqu’à tes prochaines vraies règles** : la pilule d’urgence retarde souvent l’ovulation sans l’empêcher.',
      'Si tu notes la contraception d’urgence dans Lune, le cycle reste **fertile jusqu’aux prochaines règles** et son évaluation est suspendue.',
      'Un spotting ne suffit pas : confirme de vraies règles.',
      'Vomissements dans les 3 h après la prise (ou fortes diarrhées) : reprends un comprimé.',
      '**Test de grossesse** 21 jours après le dernier rapport non protégé, ou dès 5 jours de retard de règles si la date attendue est fiable.',
      'Nouveau rapport à risque dans le même cycle ? Une 2e prise est possible : parles-en au pharmacien.',
    ],
  },
}

/** Ressources en France (spec §7, vérifiées le RESOURCES_CHECKED_AT). */
export const RESOURCES = [
  {
    label: 'Numéro vert « Sexualités, contraception, IVG »',
    phone: '0 800 08 11 11',
    url: 'https://ivg-contraception-sexualites.org/',
    detail: 'Planning familial. Gratuit et anonyme. Lundi–samedi 9 h–20 h en métropole ; Antilles lundi–vendredi 5 h–17 h ; océan Indien lundi–vendredi 8 h–18 h (fuseau non précisé). Tchat lundi–vendredi 9 h–20 h et samedi 17 h–20 h (heure de Paris). Depuis l’étranger : +33 1 48 07 10 57.',
  },
  { label: 'Planning familial', url: 'https://www.planning-familial.org/fr', detail: 'Site national du Planning familial.' },
  { label: 'QuestionSexualité (Santé publique France)', url: 'https://www.questionsexualite.fr', detail: 'Site officiel d’information, avec la rubrique « Choisir sa contraception ».' },
  { label: 'Site officiel IVG', url: 'https://ivg.gouv.fr', detail: 'Site du gouvernement sur l’IVG.' },
  {
    label: 'Centres de santé sexuelle',
    detail: 'Anciens CPEF. Contraception, contraception d’urgence, préservatifs, dépistage. Gratuit et anonyme pour les mineures et les personnes sans couverture sociale. Adresses via le numéro vert ou les sites ci-dessus.',
  },
  { label: 'CeGIDD', detail: 'Dépistage gratuit des IST, préservatifs, contraception d’urgence.' },
  { label: 'Sages-femmes', detail: 'Suivi gynécologique, toutes les contraceptions dont la pose de DIU, contraception d’urgence, IVG.' },
  { label: 'Fil Santé Jeunes', phone: '0 800 235 236', url: 'https://www.filsantejeunes.com', detail: 'Pour les 12–25 ans, tous les jours de 9 h à 23 h.' },
  { label: 'Sida Info Service', phone: '0 800 840 800', url: 'https://www.sida-info-service.org', detail: 'VIH, IST, prévention. 7 jours sur 7.' },
  { label: 'EndoFrance', url: 'https://www.endofrance.org', detail: 'Association agréée de lutte contre l’endométriose ; contact par des bénévoles en région.' },
  { label: 'ENDOmind', url: 'https://www.endomind.org', detail: 'Association de lutte contre l’endométriose.' },
  { label: 'Sensiplan', url: 'https://www.sensiplan.de', detail: 'Site officiel de la méthode : manuel, e-learning, conseillères (en allemand).' },
  { label: 'SAMU', phone: '15', detail: 'Urgence médicale.' },
  { label: 'Numéro d’urgence européen', phone: '112', detail: 'Toutes urgences.' },
  { label: 'Prévention du suicide', phone: '3114', detail: 'Si tu as des idées suicidaires.' },
  { label: 'Violences Femmes Info', phone: '3919', detail: 'Violences faites aux femmes.' },
  { label: 'Police secours', phone: '17', detail: 'Danger immédiat.' },
]

/** Date de dernière vérification des ressources (à afficher). */
export const RESOURCES_CHECKED_AT = '2026-10-04'
