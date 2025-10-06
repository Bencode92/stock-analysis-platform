// combined-recommendation.js - Moteur de recommandation avec espace pour les données juridiques
// Intégrez ici directement les données de legal-status-data.js pour éviter les problèmes de chargement

// -------------------------------------------------------
// PARTIE 1: DONNÉES DES STATUTS JURIDIQUES (À COMPLÉTER)
// -------------------------------------------------------

// Statuts juridiques et leurs caractéristiques - PLACEHOLDERS, À REMPLACER
const legalStatuses = {
  "MICRO": {
  id: 'micro-entreprise',
  name: "Micro-entreprise",
  shortName: "Micro-entreprise",
  description: "Régime simplifié de l'entreprise individuelle, avec des démarches et une comptabilité allégées.",
  logo: "fa-rocket",
  color: "#FF5722",
  categorie: 'Commerciale/Artisanale/Libérale',
  associes: '1',
  capital: 'Aucun',
  responsabilite: 'Limitée au patrimoine professionnel (séparation automatique depuis 2022)',
  fiscalite: 'IR (micro-BIC/BNC)',
  fiscaliteOption: 'Versement libératoire (optionnel, sous conditions de RFR)',
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Oui (séparation pro/perso ; exceptions : fraude, dettes fiscales/sociales, renonciation, caution personnelle)',
  chargesSociales: 'Simplifiées, calculées sur le CA',
  fiscal: "Pas de dividendes ; IR sur recettes après abattement : 71 % (ventes/restauration/hébergement*), 50 % (services BIC), 34 % (BNC). *Exception meublés de tourisme 2025 : 50 % (classé) / 30 % (non classé).",
  regimeTVA: "Franchise en base (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option possible pour être assujetti.",
  publicationComptes: 'Non',
  formalites: 'Très simplifiées',
  activite: 'La plupart des activités commerciales, artisanales et certaines libérales (hors exclusions spécifiques)',
  leveeFonds: 'Non',
  entreeAssocies: 'Non',
  profilOptimal: 'Entrepreneur solo',
  advantages: [
    "Création très simple et rapide",
    "Comptabilité ultra-simplifiée (livre des recettes, registre des achats si ventes)",
    "Charges sociales calculées uniquement sur le CA réalisé",
    "Système déclaratif simplifié en ligne",
    "Franchise en base de TVA sous les seuils (option possible pour la TVA)",
    "Régime forfaitaire avec abattement (71 %/50 %/34 %) avantageux si faibles charges",
    "Option possible pour le versement libératoire de l'IR (sous conditions de RFR)"
  ],
  disadvantages: [
    "Plafonds de chiffre d'affaires limités (ventes/hébergement : 188 700 € ; services/BNC : 77 700 € ; meublé non classé : 15 000 € en 2025)",
    "Protection non totale en cas d'exception (fraude, dettes fiscales/sociales, renonciation, caution personnelle)",
    "Déductions fiscales limitées (abattement forfaitaire)",
    "Crédibilité parfois limitée auprès des partenaires",
    "Non éligible à certains dispositifs (BSPCE, CIR...)"
  ],
  suitable_for: [
    "Activités de services à faible investissement",
    "Création d'entreprise en parallèle d'un autre statut",
    "Test d'un concept avant structure plus formelle",
    "Activités secondaires ou complémentaires"
  ],
  casConseille: 'Début d\'activité, test',
  casDeconseille: 'Développement ambitieux',
  transmission: 'Non',
  plafondCA: "188 700 € (ventes/hébergement) • 77 700 € (services/BNC) • 77 700 € (meublé classé, 2025) • 15 000 € (meublé non classé, 2025)",
  key_metrics: {
    patrimony_protection: 4,
    administrative_simplicity: 5,
    taxation_optimization: 4,
    social_charges: 4,
    fundraising_capacity: 1,
    credibility: 2,
    governance_flexibility: 5,
    transmission: 1
  }
},
"EI": {
  id: 'ei',
  name: "Entreprise Individuelle",
  shortName: "EI",
  description: "L'entrepreneur et l'entreprise ne font qu'un sur le plan juridique.",
  logo: "fa-user",
  color: "#4CAF50",
  categorie: 'Commerciale/Artisanale/Libérale (éventuellement agricole)',
  associes: '1',
  capital: 'Aucun',
  responsabilite: 'Limitée au patrimoine professionnel (séparation automatique depuis 2022 ; exceptions : fraude, dettes fiscales/sociales, renonciation, caution)',
  fiscalite: 'IR (par défaut)',
  fiscaliteOption: "IS (par assimilation EURL/EARL ; option avant la fin du 3e mois de l'exercice ; renonciation possible pendant 5 exercices, ensuite irrévocable)",
  regimeSocial: 'TNS',
  protectionPatrimoine: 'Oui (séparation pro/perso depuis 2022, avec exceptions légales)',
  chargesSociales: 'Sur bénéfices (cotisations minimales si revenu nul/faible)',
  fiscal: "IR par défaut. En cas d'option IS : rémunération + dividendes possibles",
  regimeTVA: "Assujettie selon l'activité ; franchise en base possible (2025 : 85 000/37 500 € ; tolérance 93 500/41 250 €). Option possible pour être à la TVA même sous seuils",
  publicationComptes: 'Non',
  formalites: 'Très simplifiées (démarches en ligne via le guichet unique)',
  activite: 'La plupart des activités commerciales, artisanales, libérales (et agricoles sous régimes dédiés)',
  leveeFonds: 'Non',
  entreeAssocies: 'Non',
  profilOptimal: 'Entrepreneur solo',
  advantages: [
    "Création simple et 100 % en ligne",
    "Aucun capital requis",
    "Séparation automatique des patrimoines (depuis 2022)",
    "Option possible pour l’IS (assimilation EURL) si montée en puissance",
    "Souplesse entre micro-BIC/BNC ou réel (selon CA/charges)",
    "Franchise en base de TVA possible sous seuils (ou option TVA)",
    "Formalités et obligations de publicité très légères"
  ],
  disadvantages: [
    "Protection non absolue : levée possible en cas de fraude, dettes fiscales/sociales, renonciation ou caution personnelle",
    "Impossible de faire entrer des associés ou de lever des fonds",
    "Crédibilité parfois limitée auprès des grandes banques ou investisseurs",
    "Couverture sociale TNS moins protectrice si revenus faibles",
    "Comptabilité complète dès le régime réel (hors micro)"
  ],
  suitable_for: [
    "Artisans, commerçants ou freelances travaillant seuls",
    "Test de concept avant passage en société",
    "Activité indépendante secondaire ou complémentaire"
  ],
  casConseille: 'Activité individuelle stable et peu capitalistique',
  casDeconseille: 'Projets nécessitant investisseurs ou associés',
  transmission: 'Oui (cession du fonds/activité/branche possible)',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 4,
    administrative_simplicity: 4,
    taxation_optimization: 3,
    social_charges: 3,
    fundraising_capacity: 1,
    credibility: 2,
    governance_flexibility: 4,
    transmission: 2
  }
},
"EURL": {
  id: 'eurl',
  name: "Entreprise Unipersonnelle à Responsabilité Limitée",
  shortName: "EURL",
  description: "Forme unipersonnelle de la SARL permettant de créer une société avec un seul associé tout en séparant patrimoine personnel et professionnel.",
  logo: "fa-shield-alt",
  color: "#3F51B5",
  categorie: 'Commerciale/Artisanale/Libérale',
  associes: '1',
  capital: '1€ minimum',
  responsabilite: 'Limitée aux apports',
  fiscalite: "IR par défaut si l'associé unique est une personne physique ; IS de plein droit si l'associé unique est une personne morale",
  fiscaliteOption: "Option IS (si associé personne physique) à notifier avant la fin du 3e mois de l'exercice ; renonciation possible jusqu'à la fin du 5e exercice, puis irrévocable",
  regimeSocial: "TNS (gérant associé unique) ; assimilé salarié si le gérant est non associé",
  protectionPatrimoine: 'Oui',
  chargesSociales: "À l'IR : cotisations sur le bénéfice. À l'IS : cotisations sur la rémunération + sur la part de dividendes dépassant 10 % (capital libéré + primes d'émission + compte courant)",
  fiscal: "Dividendes possibles ; à l'IS, la part > 10 % est assujettie aux cotisations TNS",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000/37 500 € ; tolérance 93 500/41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Oui (AG d'approbation sous 6 mois après clôture ; dépôt au greffe dans le mois suivant l'approbation — 2 mois si dépôt en ligne)",
  formalites: 'Modérées',
  activite: "Toutes, hors activités réglementées spécifiques (les professions réglementées privilégient souvent les SEL)",
  leveeFonds: 'Limité (structure peu attractive pour VC)',
  entreeAssocies: 'Possible (passage en SARL multi-associés)',
  profilOptimal: 'Entrepreneur solo cherchant séparation patrimoine',
  advantages: [
    "Responsabilité limitée aux apports",
    "Image de société commerciale crédible",
    "Choix de l'imposition (IR par défaut / option IS). EURL à l'IR avec gérant = associé unique éligible au régime micro",
    "Évolution simple en SARL à plusieurs associés",
    "Capital social libre (1 € minimum)",
    "Cotisations TNS moins élevées que le régime salarié"
  ],
  disadvantages: [
    "Formalités de création et gestion plus lourdes qu'une EI",
    "Coûts de constitution et dépôt des comptes",
    "Couverture sociale du TNS moins protectrice (retraite, maladie)",
    "Comptabilité et formalisme juridique (assemblées, rapports) obligatoires",
    "Moins de souplesse que la SASU pour la répartition des pouvoirs et capital"
  ],
  suitable_for: [
    "Entrepreneurs cherchant une responsabilité limitée",
    "Activités nécessitant une crédibilité vis-à-vis des clients ou banques",
    "Projets envisageant l'arrivée future de nouveaux associés"
  ],
  casConseille: 'Activités présentant un risque commercial ou financier',
  casDeconseille: 'Très petite activité avec faible CA et faible risque',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 4,
    administrative_simplicity: 3,
    taxation_optimization: 4,
    social_charges: 3,
    fundraising_capacity: 1,
    credibility: 4,
    governance_flexibility: 3,
    transmission: 3
  }
},
"SASU": {
  id: 'sasu',
  name: "Société par Actions Simplifiée Unipersonnelle",
  shortName: "SASU",
  description: "Forme unipersonnelle de la SAS offrant une grande souplesse statutaire et la protection sociale du régime général pour son président.",
  logo: "fa-chart-line",
  color: "#673AB7",
  categorie: 'Commerciale/Artisanale/Libérale',
  associes: '1',
  capital: '1€ minimum',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS (par défaut)',
  fiscaliteOption: "IR optionnelle pour 5 exercices (conditions cumulatives : société non cotée, < 5 ans, < 50 salariés, CA ou total bilan < 10 M€, activité commerciale/artisanale/agricole/libérale, ≥ 50 % des droits de vote détenus par des personnes physiques et ≥ 34 % par les dirigeants/foyer)",
  regimeSocial: "Assimilé salarié (régime général, hors assurance chômage)",
  protectionPatrimoine: 'Oui',
  chargesSociales: "Sur la rémunération du président. Les dividendes ne supportent pas de cotisations sociales (imposés comme revenus de capitaux mobiliers), sauf requalification en cas d'abus",
  fiscal: "Dividendes possibles (imposition RCM / PFU par défaut, option barème possible)",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Oui (approbation dans les 6 mois de la clôture ; dépôt au greffe dans le mois suivant l'approbation)",
  formalites: 'Modérées',
  activite: 'La plupart des activités (hors interdictions/spécifiques réglementées)',
  leveeFonds: 'Oui (instruments financiers, capital variable, pactes…)',
  entreeAssocies: 'Facile (simple cession ou augmentation de capital)',
  profilOptimal: 'Entrepreneur solo souhaitant régime salarié et levée de fonds',
  advantages: [
    "Grande souplesse statutaire (organes et pouvoirs librement fixés)",
    "Responsabilité limitée aux apports",
    "Régime social du salarié (maladie, retraite, prévoyance ; hors chômage)",
    "Dividendes non assujettis aux cotisations sociales",
    "Facilité d’accueil d’investisseurs (BSPCE, AGA, BSA…) et levée de fonds",
    "Pas de capital minimum légal",
    "Image professionnelle et crédible"
  ],
  disadvantages: [
    "Coûts de création et de gestion (expert-comptable, dépôt des comptes)",
    "Imposition IS par défaut (option IR limitée à 5 ans)",
    "Charges sociales élevées (URSSAF + caisses retraite) sur la rémunération",
    "Aucune assurance chômage de plein droit pour le président",
    "Comptabilité commerciale complète obligatoire"
  ],
  suitable_for: [
    "Start-ups et projets innovants avec perspectives de levée de fonds",
    "Entrepreneurs solos souhaitant bénéficier du régime général",
    "Consultants ou prestataires recherchant une image corporate",
    "Projets appelés à évoluer en SAS multi-actionnaires"
  ],
  casConseille: 'Salaire élevé, recherche d’investisseurs',
  casDeconseille: 'Très petit CA ou absence de rémunération',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 5,
    administrative_simplicity: 2,
    taxation_optimization: 4,
    social_charges: 2,
    fundraising_capacity: 5,
    credibility: 5,
    governance_flexibility: 5,
    transmission: 4
  }
},
"SARL": {
  id: 'sarl',
  name: "Société à Responsabilité Limitée",
  shortName: "SARL",
  description: "Société commerciale à la structure stable, dans laquelle la responsabilité des associés est limitée au montant de leurs apports.",
  logo: "fa-briefcase",
  color: "#2196F3",
  categorie: 'Commerciale/Artisanale/Industrielle (certaines libérales via SELARL)',
  associes: '2 à 100 (1 si EURL)',
  capital: '1€ minimum (20 % libérés à la constitution ; solde dans les 5 ans)',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS par défaut',
  fiscaliteOption: "IR possible pendant 5 exercices sous conditions (< 50 salariés, CA ou total de bilan < 10 M€, société < 5 ans, capital/droits majoritairement détenus par des personnes physiques et ≥ 34 % par les dirigeants et leur famille) ; pour une SARL de famille : option IR sans limite de durée. Option à exercer dans les 3 premiers mois de l'exercice",
  regimeSocial: 'TNS (gérant majoritaire) ; assimilé salarié (gérant minoritaire/égalitaire ou non associé rémunéré)',
  protectionPatrimoine: 'Oui',
  chargesSociales: "Sur rémunération du gérant (TNS ou assimilé). Si gérant majoritaire (TNS) et SARL à l'IS : cotisations aussi sur la part de dividendes dépassant 10 % (capital libéré + primes d’émission + compte courant associé)",
  fiscal: "Dividendes possibles ; traitement fiscal selon IS/IR",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Le seuil unique 25 000 € prévu par LF 2025 est suspendu en 2025. Option TVA possible sous seuils",
  publicationComptes: 'Oui',
  formalites: 'Standard',
  activite: 'Commerciales, artisanales, industrielles ; pour professions libérales réglementées : en pratique SELARL',
  leveeFonds: 'Limité (pas d’appel public à l’épargne, agrément obligatoire)',
  entreeAssocies: "Encadrée (cession à des tiers soumise à agrément : majorité des associés représentant au moins la moitié des parts)",
  profilOptimal: 'PME ou société familiale recherchant stabilité',
  advantages: [
    "Responsabilité limitée aux apports",
    "Capital social libre à partir de 1 €",
    "Structure connue et crédible auprès des partenaires",
    "Stabilité de la gouvernance (gérance, assemblée annuelle)",
    "Régime fiscal adaptable (IS par défaut ; IR sous conditions / SARL de famille sans limite)",
    "Bonne protection patrimoniale pour les associés"
  ],
  disadvantages: [
    "Formalisme juridique important (assemblées, rapports)",
    "Frais de constitution et de fonctionnement supérieurs à une EI",
    "Couverture sociale TNS moins protectrice (bien que cotisations plus faibles)",
    "Moins de souplesse que la SAS pour l’entrée d’investisseurs",
    "Cession de parts sociales encadrée (agrément des associés pour cession à des tiers)",
    "Procédures de décision parfois lourdes (quorum et majorité légale)"
  ],
  suitable_for: [
    "Petites et moyennes entreprises",
    "Projets portés par plusieurs associés",
    "Activités commerciales traditionnelles",
    "Sociétés familiales",
    "Reprise d'entreprise"
  ],
  casConseille: 'PME à capital familial, activité régulière',
  casDeconseille: 'Start-up recherchant une levée de fonds rapide',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 4,
    administrative_simplicity: 2,
    taxation_optimization: 3,
    social_charges: 3,
    fundraising_capacity: 3,
    credibility: 4,
    governance_flexibility: 2,
    transmission: 4
  }
},
"SAS": {
  id: 'sas',
  name: "Société par Actions Simplifiée",
  shortName: "SAS",
  description: "Société commerciale offrant une grande liberté contractuelle et organisationnelle.",
  logo: "fa-lightbulb",
  color: "#9C27B0",
  categorie: 'Commerciale/Artisanale/Libérale',
  associes: '2+',
  capital: '1€ minimum',
  responsabilite: 'Limitée aux apports',
  fiscalite: 'IS (par défaut)',
  fiscaliteOption: "IR optionnelle pour 5 exercices (conditions cumulatives : société non cotée, < 5 ans, < 50 salariés, CA ou total de bilan < 10 M€, activité commerciale/artisanale/agricole/libérale, ≥ 50 % des droits de vote détenus par des personnes physiques et ≥ 34 % par les dirigeants/foyer)",
  regimeSocial: "Assimilé salarié (président et dirigeants statutaires ; hors assurance chômage)",
  protectionPatrimoine: 'Oui',
  chargesSociales: "Sur la rémunération du dirigeant. Dividendes non soumis aux cotisations sociales (imposés comme revenus de capitaux mobiliers), sauf requalification en cas d’abus",
  fiscal: "Dividendes possibles (PFU par défaut / option barème). À l’IR, les bénéfices sont imposés chez les associés",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Oui (approbation dans les 6 mois après clôture ; dépôt au greffe dans le mois suivant l’approbation — 2 mois si dépôt en ligne)",
  formalites: 'Standard',
  activite: "La plupart des activités (hors activités interdites ou réglementées nécessitant une forme dédiée)",
  leveeFonds: "Oui (actions de préférence, BSPCE, BSA, pactes…)",
  entreeAssocies: "Oui (cessions/augmentations de capital facilitées par les statuts)",
  profilOptimal: "Start-up, projets avec investisseurs",
  advantages: [
    "Grande liberté statutaire (organes et pouvoirs librement fixés)",
    "Responsabilité limitée aux apports",
    "Régime social du salarié pour le président (maladie, retraite, prévoyance ; hors chômage)",
    "Dividendes non assujettis aux cotisations sociales",
    "Facilitée pour accueillir des investisseurs (BSPCE, AGA, BSA…) et lever des fonds",
    "Pas de capital minimum légal",
    "Image professionnelle et crédible"
  ],
  disadvantages: [
    "Coûts de création et de fonctionnement (compta, dépôt des comptes, conseils)",
    "Imposition IS par défaut (option IR limitée à 5 exercices sous conditions)",
    "Charges sociales élevées sur la rémunération du président",
    "Aucune assurance chômage de plein droit pour le président",
    "Commissaire aux comptes obligatoire si 2 seuils sur 3 sont dépassés (bilan 5 M€, CA 10 M€, 50 salariés) ou en cas de contrôle/contrôlée",
    "Comptabilité commerciale complète obligatoire"
  ],
  suitable_for: [
    "Projets ambitieux avec plusieurs associés",
    "Startups et entreprises innovantes",
    "Activités nécessitant des levées de fonds",
    "Sociétés avec gouvernance personnalisée",
    "Groupes de sociétés"
  ],
  casConseille: 'Start-up, levée de fonds',
  casDeconseille: 'Professions réglementées nécessitant une forme dédiée',
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 5,
    administrative_simplicity: 1,
    taxation_optimization: 4,
    social_charges: 2,
    fundraising_capacity: 5,
    credibility: 5,
    governance_flexibility: 5,
    transmission: 5
  }
},
"SA": {
  id: 'sa',
  name: "Société Anonyme",
  shortName: "SA",
  description: "Société par actions adaptée aux projets d’envergure, avec gouvernance structurée (conseil d’administration ou directoire/conseil de surveillance).",
  logo: "fa-building",
  color: "#E91E63",
  categorie: "Commerciale",
  associes: "2 (non cotée) ou 7 (cotée)",
  capital: "37 000 € (au moins 50 % libéré à la constitution, solde sous 5 ans)",
  responsabilite: "Limitée aux apports",
  fiscalite: "IS (par défaut)",
  fiscaliteOption: "IR optionnelle pour 5 exercices (conditions cumulatives : société non cotée, < 5 ans, < 50 salariés, CA ou total bilan < 10 M€, activité commerciale/artisanale/agricole/libérale, ≥ 50 % des droits de vote détenus par des personnes physiques et ≥ 34 % par les dirigeants/foyer)",
  regimeSocial: "Assimilé salarié pour les dirigeants exécutifs (PDG, DG, membres du directoire) ; pas d’assurance chômage de plein droit",
  protectionPatrimoine: "Oui",
  chargesSociales: "Sur la rémunération des dirigeants ; pas de cotisations sociales sur les dividendes (imposés en RCM, sauf requalification en cas d’abus)",
  fiscal: "Dividendes possibles (PFU par défaut ou option barème)",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Oui",
  formalites: "Complexes",
  activite: "La plupart des activités commerciales/industrielles (hors réglementations spécifiques)",
  leveeFonds: "Oui",
  entreeAssocies: "Oui",
  profilOptimal: "Projets de taille significative, crédibilité élevée, éventuelle cotation",
  advantages: [
    "Crédibilité élevée auprès des partenaires",
    "Compatible avec une introduction en bourse",
    "Gouvernance structurée (CA ou directoire/CS)",
    "Facilité de cession des actions",
    "Image institutionnelle forte"
  ],
  disadvantages: [
    "Capital minimal de 37 000 € (≥ 50 % libéré à la création)",
    "Formalisme juridique très important",
    "Coûts de création et de fonctionnement élevés",
    "Commissaire aux comptes obligatoire",
    "Processus décisionnel plus lourd (rapports, conventions réglementées, etc.)"
  ],
  suitable_for: [
    "Entreprises de taille moyenne à grande",
    "Projets visant une cotation",
    "Structures nécessitant une forte crédibilité et une gouvernance robuste",
    "Entreprises avec de nombreux actionnaires"
  ],
  casConseille: "Grande entreprise, cotation/financement important",
  casDeconseille: "Petite structure avec besoins limités",
  transmission: "Oui",
  plafondCA: "Aucun plafond",
  key_metrics: {
    patrimony_protection: 5,
    administrative_simplicity: 1,
    taxation_optimization: 3,
    social_charges: 2,
    fundraising_capacity: 5,
    credibility: 5,
    governance_flexibility: 2,
    transmission: 5
  }
},
"SNC": {
  id: 'snc',
  name: "Société en Nom Collectif",
  shortName: "SNC",
  description: "Société où tous les associés ont la qualité de commerçant et répondent indéfiniment et solidairement des dettes sociales.",
  logo: "fa-users",
  color: "#009688",
  categorie: 'Commerciale',
  associes: '2+',
  capital: 'Libre',
  responsabilite: 'Indéfinie et solidaire',
  fiscalite: 'IR par défaut (transparence) ; option IS possible',
  fiscaliteOption: "Option IS possible (renonciation envisageable pendant les 5 premiers exercices, puis irrévocable)",
  regimeSocial: "Associés gérants : TNS ; gérant non associé : assimilé salarié (régime général). Associés non gérants : TNS s’ils exercent une activité",
  protectionPatrimoine: 'Non',
  chargesSociales: "À l’IR : cotisations TNS sur la part de bénéfices (même non distribués). À l’IS : cotisations sur la rémunération des associés TNS ; gérant non associé : sur salaire",
  fiscal: 'Oui, selon IR/IS (transparence à l’IR ; IS sur option)',
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Non par défaut (obligatoire si tous les associés sont des sociétés à responsabilité limitée)",
  formalites: 'Standard (statuts, immatriculation, comptabilité commerciale)',
  activite: 'Activités commerciales (souvent commerces de proximité). Professions libérales réglementées : structures dédiées (SCP/SEL)',
  leveeFonds: 'Non',
  entreeAssocies: 'Difficile (agrément unanime en principe)',
  profilOptimal: 'Associés de confiance avec activité commerciale partagée',
  advantages: [
    "Pas de capital minimum",
    "Flexibilité statutaire et répartition libre des bénéfices",
    "Crédibilité auprès des banques dans un cadre de responsabilité solidaire",
    "Régime fiscal transparent à l’IR (option IS possible)",
    "Confidentialité des comptes possible (sous conditions)"
  ],
  disadvantages: [
    "Responsabilité illimitée et solidaire des associés",
    "Tous les associés ont la qualité de commerçant (contraintes/risques)",
    "Entrée/sortie d’associés complexe (agrément unanime)",
    "IR par défaut pouvant être pénalisant si forte TMI",
    "Protection sociale TNS (moins protectrice que le régime salarié)"
  ],
  suitable_for: [
    "Entreprises familiales ou entre associés de très grande confiance",
    "Commerces de proximité",
    "Structures recherchant la transparence fiscale (IR)"
  ],
  casConseille: 'Activité familiale, forte confiance entre associés',
  casDeconseille: 'Projet risqué ou nécessitant des investisseurs',
  transmission: 'Oui (cession de parts avec accord unanime)',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 1,
    administrative_simplicity: 3,
    taxation_optimization: 3,
    social_charges: 3,
    fundraising_capacity: 2,
    credibility: 3,
    governance_flexibility: 3,
    transmission: 2
  }
},
"SCI": {
  id: 'sci',
  name: "Société Civile Immobilière",
  shortName: "SCI",
  description: "Société civile destinée à la détention et à la gestion d’un patrimoine immobilier (acquisition, détention, location nue, mise à disposition).",
  logo: "fa-home",
  color: "#FF9800",
  categorie: 'Civile',
  associes: '2+',
  capital: 'Libre (numéraire ou apports en nature)',
  responsabilite: 'Indéfinie et proportionnelle (chaque associé répond des dettes à hauteur de sa part ; non solidaire sauf clause contraire)',
  fiscalite: 'IR par défaut (transparence : revenus fonciers chez les associés)',
  fiscaliteOption: "IS possible (option à notifier avant la fin du 3e mois de l'exercice ; révocable jusqu’à la fin du 5e exercice, puis irrévocable)",
  regimeSocial: "Aucun si le gérant n’est pas rémunéré ; en cas de rémunération : selon le cas (gérant non associé = assimilé salarié ; gérant associé = TNS s’il exerce une activité professionnelle)",
  protectionPatrimoine: 'Non',
  chargesSociales: "Aucune sans rémunération ; le cas échéant, charges selon le statut du gérant (régime général ou TNS)",
  fiscal: "Dividendes possibles uniquement si option IS",
  regimeTVA: "Location nue d’habitation : exonérée (pas d’option). Location nue à usage professionnel : option TVA possible. Location meublée d’habitation : exonérée sauf activité para-hôtelière (services type hôtel). Marchand de biens : TVA immobilière selon les opérations.",
  publicationComptes: 'Non',
  formalites: "Standard : statuts, immatriculation au RCS, publicité ; AG annuelle recommandée",
  activite: "Gestion immobilière civile (pas d’activité commerciale : meublé habituel, marchand de biens… sauf choix de structures/régimes adaptés)",
  leveeFonds: 'Non (pas d’appel public à l’épargne)',
  entreeAssocies: 'Oui (souvent avec agrément prévu aux statuts)',
  profilOptimal: 'Gestion et transmission de patrimoine immobilier',
  advantages: [
    "Facilite la détention collective d’un patrimoine immobilier",
    "Souplesse statutaire (répartition des droits et pouvoirs, clauses d’agrément)",
    "Fiscalité transparente à l’IR (déduction de charges réelles chez les associés)",
    "Option IS possible pour amortir l’immeuble et lisser le résultat",
    "Outil pertinent pour la transmission (démembrement, donations-partage)",
    "Confidentialité : pas de dépôt des comptes au greffe"
  ],
  disadvantages: [
    "Responsabilité illimitée et proportionnelle des associés",
    "Objet strictement civil : interdiction des activités commerciales (risque de requalification si meublé habituel)",
    "Coûts de fonctionnement (statuts, assemblées, comptabilité recommandée)",
    "Option IS : sortie potentiellement coûteuse (plus-values IS) ; révocation seulement pendant 5 exercices",
    "Possible contribution sur les revenus locatifs (CRL 2,5 %) pour les personnes morales non soumises à l’IS (selon cas d’exonération)"
  ],
  suitable_for: [
    "Organisation et gestion d’un patrimoine familial",
    "Transmission (donation/succession, démembrement des parts)",
    "Investissement locatif à plusieurs",
    "Recherche de souplesse d’agrément entre associés"
  ],
  casConseille: 'Gestion immobilière patrimoniale (location nue, mise à disposition)',
  casDeconseille: 'Activités commerciales (meublé habituel, para-hôtellerie, marchand de biens)',
  transmission: 'Oui (cession de parts ou transmission par donation/succession)',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 2,
    administrative_simplicity: 2,
    taxation_optimization: 4,
    social_charges: 3,
    fundraising_capacity: 1,
    credibility: 3,
    governance_flexibility: 4,
    transmission: 5
  }
},
  "SELARL": {
  id: 'selarl',
  name: "Société d'Exercice Libéral à Responsabilité Limitée",
  shortName: "SELARL",
  description: "Forme de SARL réservée aux professions libérales réglementées (avocats, experts-comptables, médecins, etc.), offrant une responsabilité limitée aux apports.",
  logo: "fa-user-md",
  color: "#00BCD4",
  categorie: 'Libérale réglementée',
  associes: '2+ (professionnels inscrits, selon règles ordinales)',
  capital: 'Libre (au moins 20 % libérés à la constitution ; solde dans les 5 ans)',
  responsabilite: "Limitée aux apports (chaque associé reste civilement responsable de ses actes professionnels ; RCP obligatoire)",
  fiscalite: "IS (par défaut)",
  fiscaliteOption: "IR optionnelle pour 5 exercices si conditions cumulatives (art. 239 bis AB : société non cotée, < 5 ans, < 50 salariés, CA ou total bilan < 10 M€, activité éligible, ≥ 50 % droits de vote par des personnes physiques et ≥ 34 % par les dirigeants/foyer)",
  regimeSocial: "TNS si gérant associé majoritaire ; assimilé salarié si gérant minoritaire/égalitaire ou tiers",
  protectionPatrimoine: 'Oui',
  chargesSociales: "Sur la rémunération (TNS ou assimilé). À l’IS, pour un gérant majoritaire TNS, la part de dividendes qui excède 10 % (capital libéré + primes + compte courant) est assujettie aux cotisations TNS",
  fiscal: "Dividendes possibles (imposition RCM : PFU par défaut ou barème sur option)",
  regimeTVA: "La SEL est assujettie selon l’activité ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 € ; seuils spécifiques pour avocats). Actes médicaux souvent exonérés. L’associé ne facture pas de TVA sur ses rémunérations techniques à la SEL",
  publicationComptes: 'Oui',
  formalites: "Standard : statuts conformes aux règles ordinales, annonce légale, dépôt au greffe, tenue d’AG annuelle",
  activite: "Exercice en commun d’une profession libérale réglementée",
  leveeFonds: "Limité (majorité du capital et des droits de vote devant rester détenue par des professionnels/structures autorisées)",
  entreeAssocies: "Oui, sous agrément et respect des règles ordinales",
  profilOptimal: "Professionnels libéraux souhaitant s’associer et protéger leur patrimoine",
  advantages: [
    "Responsabilité limitée aux apports",
    "Cadre sécurisé pour exercer à plusieurs (règles ordinales)",
    "Image crédible auprès des clients et banques",
    "Déduction des charges au niveau de la société (IS)",
    "Rémunérations techniques des associés imposées en BNC depuis 2024 (micro-BNC possible selon seuils)",
    "Continuité de l’exploitation en cas de départ d’un associé"
  ],
  disadvantages: [
    "Règles déontologiques strictes propres à chaque profession",
    "Capital et droits de vote majoritairement réservés aux professionnels : limite les investisseurs extérieurs",
    "Coûts et formalisme (comptabilité, dépôt des comptes, AG, rapports)",
    "Couverture sociale TNS moins protectrice pour les gérants majoritaires",
    "IR seulement via l’option temporaire 5 exercices (pas de ‘SELARL de famille’ en libéral)"
  ],
  suitable_for: [
    "Cabinets d’avocats, d’expertise-comptable, de santé, etc.",
    "Professionnels libéraux souhaitant s’associer en limitant leur responsabilité",
    "Structures visant une organisation stable et la préparation de la transmission"
  ],
  casConseille: "Exercice libéral en groupe, protection patrimoniale",
  casDeconseille: "Activité purement commerciale ou recherche d’investisseurs externes importants",
  transmission: 'Oui',
  plafondCA: 'Aucun plafond',
  key_metrics: {
    patrimony_protection: 4,
    administrative_simplicity: 2,
    taxation_optimization: 3,
    social_charges: 3,
    fundraising_capacity: 2,
    credibility: 4,
    governance_flexibility: 3,
    transmission: 4
  }
},
"SELAS": {
  id: 'selas',
  name: "Société d'Exercice Libéral par Actions Simplifiée",
  shortName: "SELAS",
  description: "Forme de SAS réservée aux professions libérales réglementées (avocats, médecins, experts-comptables, etc.), offrant une gouvernance souple et la responsabilité limitée aux apports.",
  logo: "fa-stethoscope",
  color: "#8BC34A",
  categorie: "Libérale réglementée",
  associes: "1+ (SELASU) ou 2+",
  capital: "Libre (à partir de 1 €). Au moins 50 % du capital et des droits de vote doivent être détenus par des professionnels en exercice (sauf règles spécifiques de l’ordre).",
  responsabilite: "Limitée aux apports (mise en cause personnelle possible en cas de faute professionnelle ou manquement déontologique)",
  fiscalite: "IS (par défaut)",
  fiscaliteOption: "IR optionnelle pendant 5 exercices si toutes les conditions de l’art. 239 bis AB CGI sont remplies (société non cotée, < 5 ans, < 50 salariés, CA ou bilan < 10 M€, activité éligible, ≥ 50 % des droits de vote détenus par des personnes physiques et ≥ 34 % par les dirigeants/foyer)",
  regimeSocial: "Président assimilé salarié (régime général, hors assurance chômage)",
  protectionPatrimoine: "Oui",
  chargesSociales: "Sur la rémunération du président ; dividendes non assujettis aux cotisations sociales (sauf requalification en cas d’abus)",
  fiscal: "Dividendes possibles (PFU par défaut ou option barème). La rémunération liée aux actes professionnels d’associés peut relever des BNC selon les règles fiscales applicables.",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option TVA possible sous seuils",
  publicationComptes: "Oui (approbation des comptes classiquement sous 6 mois après clôture ; dépôt au greffe dans le mois suivant l’approbation, 2 mois si dépôt en ligne)",
  formalites: "Standard SAS + formalités auprès de l’ordre professionnel (inscription, agréments)",
  activite: "Exercice en commun d’une profession libérale réglementée",
  leveeFonds: "Oui, mais limitée par l’obligation de détention majoritaire par des professionnels et les règles ordinales",
  entreeAssocies: "Oui, sous agrément et respect des quotas de détention",
  profilOptimal: "Cabinets libéraux recherchant souplesse statutaire et image corporate",
  advantages: [
    "Grande souplesse statutaire (gouvernance personnalisable)",
    "Responsabilité limitée aux apports",
    "Protection sociale du régime général pour le président",
    "Facilite l’entrée d’investisseurs (actions de préférence, etc.) sous contraintes ordinales",
    "Dividendes non assujettis aux cotisations sociales"
  ],
  disadvantages: [
    "Charges sociales élevées sur la rémunération du président (assimilé salarié)",
    "Capital et droits de vote majoritairement réservés aux professionnels",
    "Contraintes déontologiques et agréments selon la profession",
    "Coûts de fonctionnement (expert-comptable, CAC au-delà des seuils) et formalités ordinales",
    "Option IR possible mais très encadrée et limitée à 5 exercices"
  ],
  suitable_for: [
    "Cabinets libéraux en croissance",
    "Structures souhaitant associer des professionnels et, à la marge, des investisseurs",
    "Professions libérales recherchant une gouvernance flexible"
  ],
  casConseille: "Professions libérales réglementées",
  casDeconseille: "Activités purement commerciales ou besoin d’un statut TNS",
  transmission: "Oui (cession d’actions le plus souvent soumise à agrément ordinal)",
  plafondCA: "Aucun plafond",
  key_metrics: {
    patrimony_protection: 5,
    administrative_simplicity: 2,
    taxation_optimization: 3,
    social_charges: 2,
    fundraising_capacity: 4,
    credibility: 5,
    governance_flexibility: 5,
    transmission: 4
  }
},
   "SCA": {
  id: "sca",
  name: "Société en Commandite par Actions",
  shortName: "SCA",
  description: "Société par actions hybride : capital régi comme en SA et gestion assurée par des gérants ; commandités responsables indéfiniment, commanditaires responsables à hauteur de leurs apports.",
  logo: "fa-university",
  color: "#607D8B",
  categorie: "Commerciale",
  associes: "Au moins 4 (1 commandité + 3 commanditaires) — 7 si appel public à l’épargne",
  capital: "37 000 € minimum (50 % libérés à la constitution, solde sous 5 ans) — 225 000 € si appel public à l’épargne",
  responsabilite: "Commandités : indéfinie et solidaire • Commanditaires : limitée à l’apport",
  fiscalite: "IS obligatoire",
  fiscaliteOption: "Non",
  regimeSocial: "Gérant rémunéré : assimilé salarié (régime général, au titre du mandat social) • Gérant non rémunéré : pas de cotisations • Commanditaires sans mandat : hors régime",
  protectionPatrimoine: "Partielle (commandités non protégés ; commanditaires protégés)",
  chargesSociales: "Sur la rémunération du/des gérants ; pas de cotisations sur dividendes",
  fiscal: "Oui (dividendes possibles selon résultat et réserves)",
  regimeTVA: "Assujettie ; franchise en base possible (2025 : 85 000 € ventes / 37 500 € services ; tolérance 93 500 € / 41 250 €). Option possible pour être à la TVA sous seuils",
  publicationComptes: "Oui (approbation dans les 6 mois de la clôture ; dépôt au greffe dans le mois suivant l’approbation)",
  formalites: "Complexes (statuts détaillés, gérance + conseil de surveillance, commissaires aux comptes, rapport de gestion, dépôt des comptes)",
  activite: "Groupes familiaux, holdings, projets souhaitant séparer gestion et capital",
  leveeFonds: "Oui",
  entreeAssocies: "Oui (émission/cession d’actions ; clauses d’agrément/statutaires possibles)",
  profilOptimal: "Conserver la direction tout en ouvrant le capital",
  advantages: [
    "Stabilité de la direction (commandités difficilement révocables par les commanditaires)",
    "Séparation claire entre gestion (commandités) et apport de capitaux (commanditaires)",
    "Accès aux capitaux via l’émission d’actions",
    "Outil apprécié pour garder le contrôle (anti-OPA) dans certains schémas familiaux"
  ],
  disadvantages: [
    "Responsabilité illimitée pour les commandités",
    "Régime juridique et gouvernance complexes (règles SA + commandite)",
    "Capital élevé en cas d’appel public (225 000 €)",
    "Coûts de constitution et de fonctionnement importants (CAC, formalisme)",
    "Forme rare, parfois mal comprise des partenaires"
  ],
  suitable_for: [
    "Groupes familiaux voulant lever des fonds tout en gardant la direction",
    "Holdings industrielles/financières avec séparation forte gestion/capital",
    "Entreprises souhaitant se protéger d’OPA hostiles"
  ],
  casConseille: "Groupes familiaux ou holdings recherchant levée de fonds avec contrôle",
  casDeconseille: "Entrepreneurs recherchant simplicité et flexibilité",
  transmission: "Oui",
  plafondCA: "Aucun plafond",
  key_metrics: {
    patrimony_protection: 2,
    administrative_simplicity: 1,
    taxation_optimization: 3,
    social_charges: 2,
    fundraising_capacity: 5,
    credibility: 4,
    governance_flexibility: 3,
    transmission: 4
  }
}
};

// S'assurer que window.legalStatuses est défini immédiatement
window.legalStatuses = legalStatuses;

// Helper yes/no — définition unique + réutilisable
if (typeof window.isYes !== 'function') {
  window.isYes = function (v) {
    return String(v).toLowerCase() === 'yes';
  };
}
const isYes = window.isYes;

// Barèmes et filtres (corrigés)
const exclusionFilters = [
  // Professions avec ordre (avocats, médecins, EC, etc.)
  // -> On N'EXCLUT PLUS la MICRO globalement ; on écarte surtout la SNC.
  {
    id: "professional_order",
    condition: (answers) =>
      isYes(answers.professional_order) || isYes(answers.regulated_profession),
    excluded_statuses: ["SNC"],
    tolerance_message:
      "Si vous exercez à titre individuel, EI/Micro peuvent rester possibles selon l’ordre. En exercice en société, privilégiez les SEL (SELARL/SELAS)."
  },

  // Solo : on masque les formes nécessitant ≥ 2 associés
  // (on NE masque PAS SELARL/SELAS pour permettre SELARLU/SELASU)
  {
    id: "team_structure",
    condition: (answers) =>
      answers.team_structure === "solo" &&
      !(answers.activity_type === 'immobilier' && isYes(answers.family_project)),
    excluded_statuses: ["SAS", "SARL", "SA", "SNC", "SCI", "SCA"],
    tolerance_message: null
  },

  // Capital disponible : seuil utile pour SA/SCA (≥ 37 000 € dont 50 % à la constitution)
  {
    id: "available_capital",
    condition: (answers) => Number(answers.available_capital || 0) < 18500, // 50 % de 37 000 €
    excluded_statuses: ["SA", "SCA"],
    tolerance_message:
      "La SA/SCA exigent au moins 37 000 € de capital (≥ 50 % libérés à la constitution)."
  },

  // Souhait du régime social "assimilé salarié"
  // (On exclut les statuts TNS par défaut ; exceptions possibles selon la gérance)
  {
    id: "social_regime",
    condition: (answers) => answers.social_regime === "assimilated_employee",
    excluded_statuses: ["EI", "MICRO", "SNC", "EURL", "SARL", "SELARL"],
    tolerance_message:
      "EURL/SARL/SELARL peuvent parfois convenir si le dirigeant est non associé ou minoritaire/égalitaire (assimilé salarié)."
  },

  // Mineur non émancipé : on masque les sociétés commerciales
  {
    id: "age",
    condition: (answers) => answers.age === "minor",
    tolerance_condition: (answers) => isYes(answers.emancipated_minor),
    excluded_statuses: ["SAS", "SARL", "SA", "EURL", "SASU", "SNC", "SCI", "SELARL", "SELAS", "SCA"],
    tolerance_message:
      "Si vous êtes mineur émancipé, certaines sociétés commerciales restent accessibles."
  },

  // Instruments d’actionnariat (BSPCE, AGA, BSA, actions de préférence…)
  // -> Réservés SAS/SASU/SA/SELAS (sous conditions). On exclut aussi SARL/EURL/SELARL/SCI.
  {
    id: "sharing_instruments",
    condition: (answers) =>
      Array.isArray(answers.sharing_instruments) &&
      answers.sharing_instruments.length > 0,
    excluded_statuses: ["EI", "MICRO", "SNC", "SARL", "EURL", "SELARL", "SCI"],
    tolerance_message:
      "BSPCE/AGA/BSA sont possibles en SAS/SASU/SA/SELAS (sous conditions légales)."
  },

  // Appel public à l’épargne / cotation : SA ou SCA uniquement
  {
    id: "public_listing_or_aps",
    condition: (answers) =>
      isYes(answers.public_listing_or_aps) || isYes(answers.ipo_path),
    excluded_statuses: ["EI", "MICRO", "EURL", "SASU", "SAS", "SARL", "SNC", "SCI", "SELARL", "SELAS"],
    tolerance_message:
      "Pour une cotation ou un appel public à l’épargne, orientez-vous vers une SA (ou SCA)."
  }
];

window.exclusionFilters = exclusionFilters;
const ratingScales = {
  taxation: {
    EI: 3,
    MICRO: 4,
    EURL: 4,
    SASU: 4,
    SARL: 3,
    SAS: 4,
    SA: 3,
    SNC: 3,
    SCI: 4,
    SELARL: 3,
    SELAS: 3,
    SCA: 3
  },
  social_cost: {
    EI: 3,
    MICRO: 4, // ajusté (était 5) pour coller à tes key_metrics
    EURL: 3,
    SASU: 2,
    SARL: 3,
    SAS: 2,
    SA: 2,
    SNC: 3,
    SCI: 3,
    SELARL: 3,
    SELAS: 2,
    SCA: 2
  },
  patrimony_protection: {
    EI: 4,
    MICRO: 4,
    EURL: 4,
    SASU: 5,
    SARL: 4,
    SAS: 5,
    SA: 5,
    SNC: 1,
    SCI: 2,
    SELARL: 4,
    SELAS: 5,
    SCA: 2 // ajusté (était 3) : commandités illimité
  },
  governance_flexibility: {
    EI: 4,     // ajusté (était 5)
    MICRO: 5,
    EURL: 3,   // ajusté (était 4)
    SASU: 5,   // ajusté (était 4)
    SARL: 2,   // ajusté (était 3)
    SAS: 5,    // ajusté (était 4)
    SA: 2,
    SNC: 3,
    SCI: 4,
    SELARL: 3,
    SELAS: 5,  // ajusté (était 4)
    SCA: 3     // ajusté (était 2)
  },
  fundraising: {
    EI: 1,
    MICRO: 1,
    EURL: 1,   // ajusté (était 2)
    SASU: 5,   // ajusté (était 4)
    SARL: 3,   // ajusté (était 2)
    SAS: 5,
    SA: 5,     // ajusté (était 4)
    SNC: 1,
    SCI: 1,
    SELARL: 2, // ajusté (était 3)
    SELAS: 4,  // ajusté (était 5)
    SCA: 5     // ajusté (était 3)
  },
  flexibility: {
    EI: 5,
    MICRO: 5,
    EURL: 3,
    SASU: 5,
    SARL: 2,
    SAS: 5,
    SA: 1,
    SNC: 2,
    SCI: 3,
    SELARL: 2,
    SELAS: 5,  // ajusté (était 4)
    SCA: 2
  },
  administrative_simplicity: {
    EI: 4,   // ajusté (était 5)
    MICRO: 5,
    EURL: 3,
    SASU: 2,
    SARL: 2, // ajusté (était 3)
    SAS: 1,  // ajusté (était 2)
    SA: 1,
    SNC: 3,
    SCI: 2,  // ajusté (était 3)
    SELARL: 2, // ajusté (était 3)
    SELAS: 2,
    SCA: 1
  },
  accounting_cost: {
    EI: 4,
    MICRO: 5,
    EURL: 4,
    SASU: 3,
    SARL: 3,
    SAS: 3,
    SA: 1,
    SNC: 3, // ajusté (était 2)
    SCI: 4,
    SELARL: 3,
    SELAS: 3,
    SCA: 1
  },
  transmission: {
    EI: 2,      // ajusté (était 1)
    MICRO: 1,
    EURL: 3,
    SASU: 4,
    SARL: 4,    // ajusté (était 3)
    SAS: 5,
    SA: 5,
    SNC: 2,
    SCI: 5,
    SELARL: 4,  // ajusté (était 3)
    SELAS: 4,
    SCA: 4      // ajusté (était 3)
  }
};
window.ratingScales = ratingScales;
// ─────────────────────────────
// Helpers secteur d'activité
// ─────────────────────────────
function getSector(answers) {
  return String(answers?.activity_sector || answers?.activity_type || '')
    .toLowerCase()
    .trim();
}
function isRealEstateSector(answers) {
  const s = getSector(answers);
  return ['immobilier', 'real_estate', 'realestate', 'real-estate', 'immo'].includes(s);
}
// Optionnel : exposer pour d'autres modules / debug
window.getSector = getSector;
window.isRealEstateSector = isRealEstateSector;

// Helper unifié Immobilier (utilisable partout)
const IS_IMMO = (ans) =>
  (typeof window.isRealEstateSector === 'function' && window.isRealEstateSector(ans)) ||
  String(ans?.activity_type || '').toLowerCase() === 'immobilier';
window.IS_IMMO = IS_IMMO; // optionnel : exposer globalement

// Helpers immo fins
const isImmoPatrimonial = (a) =>
  IS_IMMO(a) && ['patrimonial_nue', 'bureaux_nus', null, undefined].includes((a?.real_estate_model ?? null));

const isImmoCommercial = (a) =>
  IS_IMMO(a) &&
  ['marchand', 'promotion', 'lotissement', 'para_hotel', 'para-hotelier'].includes(
    String(a?.real_estate_model || '').toLowerCase()
  );

// ─────────────────────────────
// Gestionnaire d'erreurs & logs
// ─────────────────────────────
window.addEventListener(
  'error',
  (e) => {
    const f = e?.filename || '';
    if (f.includes('recommendation-engine.js') || f.includes('combined-recommendation.js')) {
      console.error('Erreur bloquante dans le moteur de recommandation', e);
    }
  },
  true
);
console.log('Chargement du recommendation-engine.js commencé');
window.engineLoadingStarted = true;

// ─────────────────────────────
// Sets utiles (déclarés AVANT le tableau de règles)
// ─────────────────────────────
const ALL_STATUS_IDS = [
  'MICRO',
  'EI',
  'EURL',
  'SASU',
  'SARL',
  'SAS',
  'SA',
  'SNC',
  'SCI',
  'SELARL',
  'SELAS',
  'SCA'
];
// Statuts “avec titres/parts” (on exclut EI/MICRO)
const SHARE_BASED_STATUS_IDS = [
  'EURL',
  'SARL',
  'SASU',
  'SAS',
  'SA',
  'SELARL',
  'SELAS',
  'SCI',
  'SCA',
  'SNC'
];

// ------------------------------------------------
// PARTIE 2: MOTEUR DE RECOMMANDATION (COMPLET)
// ------------------------------------------------
const scoringRules = [
  // ──────────────────────────────────────────────
  // Règles pour la protection du patrimoine
  // ──────────────────────────────────────────────
  {
    id: 'essential_patrimony_protection',
    description: 'Protection du patrimoine essentielle',
    condition: (a) => a.patrimony_protection === 'essential',
    apply: (statusId, score) => {
      // +1 pour toutes les formes à responsabilité limitée (hors SCI et SCA)
      if (['SASU', 'SAS', 'SARL', 'EURL', 'SA', 'SELAS', 'SELARL', 'EI', 'MICRO'].includes(statusId)) {
        return score + 1;
      }
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'high_risk_activity_ei_micro', // id conservé, logique corrigée
    description:
      'Activité à risque élevé : pénalise surtout les formes à responsabilité illimitée',
    condition: (a) => a.high_professional_risk === 'yes',
    apply: (statusId, score) => {
      if (statusId === 'SNC') return score - 1.5; // illimitée & solidaire
      if (statusId === 'SCA') return score - 1; // commandités illimités
      if (statusId === 'SCI') return score - 0.5; // illimitée mais proportionnelle
      // EI/MICRO ne sont plus illimitées depuis 2022 → pas de malus spécifique ici
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'sca_anti_takeover_protection',
    description: 'SCA : protection anti-OPA',
    condition: (a) => isYes(a.takeover_protection) || isYes(a.hostile_takeover_concern),
    apply: (statusId, score) => (statusId === 'SCA' ? score + 1.5 : score),
    criteria: 'patrimony_protection'
  },

  {
    id: 'sci_patrimony_separation_bonus',
    description: 'SCI : séparation du patrimoine immobilier (pertinent si activité immobilière)',
    condition: (a) =>
      a.patrimony_protection === 'essential' &&
      String(a.activity_type || '').toLowerCase() === 'immobilier' &&
      !isYes(a.bank_guarantee),
    apply: (statusId, score) => (statusId === 'SCI' ? score + 1 : score),
    criteria: 'patrimony_protection'
  },

  {
    id: 'risk_aversion_liability_shift',
    description: 'Appétence au risque faible : privilégier la responsabilité limitée',
    condition: (a) => a.risk_appetite !== undefined && a.risk_appetite <= 2,
    apply: (statusId, score) => {
      if (statusId === 'SNC') return score - 0.75; // illimitée & solidaire
      if (statusId === 'SCA') return score - 0.5; // commandités illimités
      // Bonus aux formes limitées (y compris EI/MICRO depuis 2022). On exclut la SCI.
      if (['SASU', 'SAS', 'SARL', 'EURL', 'SA', 'SELAS', 'SELARL', 'EI', 'MICRO'].includes(statusId))
        return score + 0.5;
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'bank_guarantee_liability_penalty',
    description:
      'Caution bancaire personnelle : neutralise la protection, quel que soit le statut',
    condition: (a) => isYes(a.bank_guarantee),
    apply: (statusId, score) => {
      // La caution perso expose le patrimoine perso dans tous les cas → malus uniforme
      return score - 0.5;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'holding_asset_separation_bonus',
    description: 'Holding de tête : bonus pour dissocier patrimoine et opérationnel',
    condition: (a) => isYes(a.holding_company),
    apply: (statusId, score) => {
      // Holding pertinent surtout en sociétés (pas en EI/MICRO)
      if (['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'SELAS', 'SELARL'].includes(statusId)) {
        return score + 0.5;
      }
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'unlimited_liability_penalty',
    description:
      'Responsabilité illimitée pénalisée si protection essentielle ou activité à risque',
    condition: (a) => a.patrimony_protection === 'essential' || isYes(a.high_professional_risk),
    apply: (statusId, score, a) => {
      const isImmo =
        typeof IS_IMMO === 'function' ? IS_IMMO(a) : String(a.activity_type || '').toLowerCase() === 'immobilier';
      if (statusId === 'SNC') return score - 2; // illimitée & solidaire
      if (statusId === 'SCA') return score - 1; // commandités illimités
      // SCI : pénalité seulement hors cas immobilier
      if (statusId === 'SCI' && !isImmo) return score - 0.5;
      // EI / MICRO ne sont plus illimitées depuis 2022 → pas de malus
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'ei_2022_partial_shield',
    description:
      'Entreprise individuelle (réforme 2022) : séparation patrimoine pro/perso',
    condition: () => true, // toujours évaluée
    apply: (statusId, score) => {
      if (statusId === 'EI' || statusId === 'MICRO') {
        return score + 0.5;
      }
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'collaborating_spouse_shared_risk',
    description: 'Conjoint collaborateur : accroît le risque sur les formes illimitées',
    condition: (a) => isYes(a.collaborating_spouse),
    apply: (statusId, score) => {
      if (statusId === 'SNC') return score - 0.5; // illimitée & solidaire
      // EI/MICRO : depuis 2022, protection améliorée → malus allégé
      if (statusId === 'EI' || statusId === 'MICRO') return score - 0.25;
      return score;
    },
    criteria: 'patrimony_protection'
  },

  {
    id: 'sci_real_estate_shield',
    description: 'Immobilier sans caution bancaire : la SCI isole le bien',
    condition: (a) => {
      const isImmo =
        typeof IS_IMMO === 'function' ? IS_IMMO(a) : String(a.activity_type || '').toLowerCase() === 'immobilier';
      return isImmo && !isYes(a.bank_guarantee);
    },
    apply: (statusId, score) => (statusId === 'SCI' ? score + 1 : score),
    criteria: 'patrimony_protection'
  },

  {
    id: 'eurl_majority_penalty',
    description: 'Associé ≥ 75 % + caution perso : pénalité EURL / SARL',
    condition: (a) => {
      const pct = parseFloat(a.capital_percentage ?? 0);
      return Number.isFinite(pct) && pct >= 75 && isYes(a.bank_guarantee);
    },
    apply: (statusId, score) => (['EURL', 'SARL'].includes(statusId) ? score - 0.5 : score),
    criteria: 'patrimony_protection'
  },

  {
    id: 'multiple_housing_units_bonus',
    description: 'Portefeuille immo (> 120 k€ CA) : bonus SCI pour cantonnement',
    condition: (a) => String(a.activity_type || '').toLowerCase() === 'immobilier' && parseFloat(a.projected_revenue || 0) > 120_000,
    apply: (statusId, score) => (statusId === 'SCI' ? score + 1 : score),
    criteria: 'patrimony_protection'
  },

  // ──────────────────────────────────────────────
  // MATRIMONIAL & CAUTION – Patrimoine / Transmission / Crédibilité
  // ──────────────────────────────────────────────

  // 1) Séparation de biens : micro-bonus patrimoine (toutes formes)
  {
    id: 'matri_sep_bonus',
    description: 'Séparation de biens : meilleure étanchéité perso/couple',
    condition: (a) => a._is_sep,
    apply: (statusId, score) => (ALL_STATUS_IDS.includes(statusId) ? score + 0.25 : score),
    criteria: 'patrimony_protection',
    priority: 60
  },

  // 2) Communauté (réduite ou universelle) : léger malus patrimoine (toutes formes)
  {
    id: 'matri_community_soft_malus',
    description: 'Communauté : exposition potentielle des biens communs',
    condition: (a) => a._is_community,
    apply: (statusId, score) => (ALL_STATUS_IDS.includes(statusId) ? score - 0.25 : score),
    criteria: 'patrimony_protection',
    priority: 61
  },

  // 3) Caution perso avec périmètre commun : malus plus fort (toutes formes)
  {
    id: 'guarantee_common_scope_strong_malus',
    description: 'Caution personnelle susceptible d’engager les biens communs',
    condition: (a) => !!a._bank_guarantee_common_scope,
    apply: (statusId, score) => (ALL_STATUS_IDS.includes(statusId) ? score - 0.5 : score),
    criteria: 'patrimony_protection',
    priority: 62
  },

  // 4) Caution négociée “exclusion biens communs” : on atténue le malus générique
  {
    id: 'guarantee_exclude_common_relief',
    description: 'Caution négociée : exclusion des biens communs',
    condition: (a) =>
      a._is_community && a.personal_guarantee_scope === 'exclude_common' && isYes(a.bank_guarantee),
    apply: (statusId, score) => (ALL_STATUS_IDS.includes(statusId) ? score + 0.25 : score),
    criteria: 'patrimony_protection',
    priority: 63
  },

  // 5) Apport en biens communs → parts potentiellement communes : malus transmission
  {
    id: 'apport_common_transmission_malus',
    description: 'Apport en biens communs : droits/parts potentiellement communs',
    condition: (a) => !!a._shares_may_be_common,
    apply: (statusId, score) => (SHARE_BASED_STATUS_IDS.includes(statusId) ? score - 0.25 : score),
    criteria: 'transmission',
    priority: 64
  },

  // 6) Apport strictement personnel : titres plus faciles à céder/donner (bonus)
  {
    id: 'apport_personal_transmission_bonus',
    description: 'Apport en biens propres : titres plus aisés à céder/donner',
    condition: (a) => a._is_married && a.apport_origin === 'personal_funds',
    apply: (statusId, score) => (SHARE_BASED_STATUS_IDS.includes(statusId) ? score + 0.25 : score),
    criteria: 'transmission',
    priority: 65
  },

  // 7) Régime matrimonial “inconnu” : petit malus crédibilité (toutes formes)
  {
    id: 'matri_unknown_credibility_malus',
    description: 'Régime matrimonial non renseigné',
    condition: (a) => !!a._matrimonial_unknown,
    apply: (statusId, score) => (ALL_STATUS_IDS.includes(statusId) ? score - 0.25 : score),
    criteria: 'credibility',
    priority: 90
  },

    // Règles pour la simplicité administrative
        {

  id: 'high_revenue_small_structures',
  description: 'CA élevé pour petites structures',
  condition: answers => parseFloat(answers.projected_revenue ?? 0) > 100_000,
apply: (statusId, score, answers, metrics) => {
    // À partir d'un certain volume, EI/MICRO deviennent moins “simples” (TVA, obligations…)
    if (['EI', 'MICRO'].includes(statusId)) return score - 1;
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'low_revenue_structure_penalty',
  description: 'Faible CA : structures complexes inadaptées',
  condition: answers => parseFloat(answers.projected_revenue ?? 0) < 50_000,
 apply: (statusId, score, answers, metrics) => {
    if (['SAS', 'SA', 'SARL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) return score - 1;
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'high_revenue_complex_structures',
  description: 'CA élevé pour structures sociétaires complètes',
  condition: answers => parseFloat(answers.projected_revenue ?? 0) > 300_000,
  apply: (statusId, score, answers, metrics) => {
    if (['SAS', 'SA', 'SARL', 'SELAS', 'SELARL'].includes(statusId)) return score + 0.5;
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'accounting_complexity_simple',
  description: 'Préférence pour comptabilité simple',
  condition: answers => answers.accounting_complexity === 'simple',
 apply: (statusId, score, answers, metrics) => {
    // Pénalise les formes avec formalisme/comptabilité plus lourds
    if (['SAS', 'SA', 'SARL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) return score - 1;
    return score;
  },
  criteria: 'administrative_simplicity'
},

// (supprimé : "accounting_outsourced_micro" — redondant/incohérent avec la règle d’externalisation plus bas)

{
  id: 'sca_large_capital_requirement',
  description: 'SCA : capital disponible < 37 000 €',
  condition: answers => parseFloat(answers.available_capital ?? 0) < 37_000,
  apply: (statusId, score) => (statusId === 'SCA' ? score - 2 : score),
  criteria: 'administrative_simplicity'
},

{
  id: 'sca_complexity_penalty',
  description: 'SCA : complexité pénalisante si CA < 500 k€',
  condition: answers => parseFloat(answers.projected_revenue ?? 0) < 500_000,
  apply: (statusId, score) => (statusId === 'SCA' ? score - 1.5 : score),
  criteria: 'administrative_simplicity'
},
{
  id: 'non_liberal_sel_exclusion',
  description: 'SEL : exclusion si activité non libérale',
  condition: (a) =>
    !isYes(a.professional_order) &&
    !isYes(a.regulated_profession) &&
    String(a.activity_sector || '').toLowerCase() !== 'liberal',
  apply: (statusId, score) =>
    (['SELARL', 'SELAS'].includes(statusId) ? score - 10 : score),
  criteria: 'administrative_simplicity'
},
{
  id: 'sci_simplicity_penalty',
  description: 'SCI : pénalité si recherche de simplicité comptable',
  condition: answers => answers.accounting_complexity === 'simple',
  apply: (statusId, score) => (statusId === 'SCI' ? score - 0.5 : score),
  criteria: 'administrative_simplicity'
},

// TVA (évite les doublons : on garde seulement ces deux règles)
{
  id: 'vat_franchise_micro_bonus',
  description: 'Franchise en base de TVA : formalités ultra-légères pour EI / MICRO',
  condition: answers => answers.vat_regime === 'franchise',
  apply: (statusId, score) => (['EI', 'MICRO'].includes(statusId) ? score + 0.5 : score),
  criteria: 'administrative_simplicity'
},

{
  id: 'vat_real_micro_penalty',
  description: 'Régime réel (ou simplifié) de TVA : surcharge pour EI / MICRO',
  condition: answers => answers.vat_regime === 'real' || answers.vat_regime === 'simplified',
  apply: (statusId, score) => (['EI', 'MICRO'].includes(statusId) ? score - 0.5 : score),
  criteria: 'administrative_simplicity'
},

{
  id: 'solo_project_bonus_solo_status',
  description: 'Projet solo : bonus EI/MICRO/EURL/SASU, malus statuts collectifs',
  condition: answers => answers.team_structure === 'solo',
apply: (statusId, score, answers, metrics) => {
    if (['EI', 'MICRO', 'EURL', 'SASU'].includes(statusId)) return score + 0.5;
    if (['SNC', 'SCI', 'SARL', 'SAS', 'SA', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) return score - 0.5;
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'associate_number_complexity',
  description: 'Plus de 10 associés : pénalité croissante',
  condition: answers => parseInt(answers.associates_number ?? 0, 10) > 10,
  apply: (statusId, score, answers, metrics) => {
    if (['SA', 'SCA'].includes(statusId)) return score - 2;
    if (['SAS', 'SARL', 'SCI', 'SELARL', 'SELAS'].includes(statusId)) return score - 1;
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'integration_fiscale_penalty',
  description: 'Intégration fiscale de groupe : complexité supplémentaire',
  condition: (a) => isYes(a.tax_integration),
  apply: (statusId, score) =>
    (['SAS', 'SARL', 'SA', 'SELAS', 'SELARL'].includes(statusId) ? score - 1 : score),
  criteria: 'administrative_simplicity'
},

{
  id: 'holding_structure_penalty',
  description: 'Holding de tête : pénalité de simplicité (sauf SCI)',
  condition: (a) => isYes(a.holding_company),
  apply: (statusId, score) => (statusId !== 'SCI' ? score - 0.5 : score),
  criteria: 'administrative_simplicity'
},
{
  id: 'sca_sa_capital_penalty',
  description: 'Capital disponible < 37 000 € : pénalité SA et SCA',
  condition: answers => parseFloat(answers.available_capital ?? 0) < 37_000,
  apply: (statusId, score) => (['SA', 'SCA'].includes(statusId) ? score - 2 : score),
  criteria: 'administrative_simplicity'
},
    // Règles pour l'optimisation fiscale
   {
  id: 'high_tmi_ir_malus',
  description: 'TMI élevée défavorable pour IR',
  condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
apply: (statusId, score, answers, metrics) => {
    // Formes à l’IR (ou transparentes) pénalisées si TMI élevée
    if (['EI', 'MICRO', 'SNC'].includes(statusId)) return score - 1.5;
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'high_tmi_is_bonus',
  description: 'TMI élevée favorable pour IS',
  condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
  apply: (statusId, score, answers, metrics) => {
    // Toutes formes IS structurellement avantagées quand TMI perso est élevé
    if (['SASU', 'SAS', 'SA', 'SARL', 'EURL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) return score + 1;
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'low_tmi_micro_bonus',
  description: 'TMI faible favorable pour micro',
  condition: answers => ['non_taxable', 'bracket_11'].includes(answers.tax_bracket),
  apply: (statusId, score) => (statusId === 'MICRO' ? score + 1 : score),
  criteria: 'taxation_optimization'
},

{
  id: 'expense_ratio_micro_rules_bonus',
  description: 'Faibles charges réelles : micro avantageux',
  // expense_ratio = charges réelles / CA (0 → 1). Valeur facultative.
  condition: answers => parseFloat(answers.expense_ratio ?? -1) >= 0 && parseFloat(answers.expense_ratio) <= 0.30,
  apply: (statusId, score) => (statusId === 'MICRO' ? score + 0.75 : score),
  criteria: 'taxation_optimization'
},

{
  id: 'expense_ratio_micro_rules_malus',
  description: 'Charges élevées : micro défavorable, réel/IS favorables',
  condition: answers => parseFloat(answers.expense_ratio ?? -1) >= 0.50,
 apply: (statusId, score, answers, metrics) => {
    if (statusId === 'MICRO') return score - 1;
    if (['EI', 'EURL', 'SARL', 'SASU', 'SAS', 'SA', 'SELARL', 'SELAS'].includes(statusId)) return score + 0.5;
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'dividend_preference_is',
  description: 'Préférence dividendes : favorable aux formes IS',
  condition: answers => answers.remuneration_preference === 'dividends',
apply: (statusId, score, answers, metrics) => {
    // Dividendes + : SASU/SAS/SA/SELAS (pas de cotisations sociales en principe)
    if (['SASU', 'SAS', 'SA', 'SELAS'].includes(statusId)) return score + 0.75;
    // EURL / SARL : bonus bridé (risque cotisations TNS >10 %)
    if (statusId === 'EURL') return score + 0.1;
    if (statusId === 'SARL') {
      const pct = parseFloat(answers.capital_percentage ?? 0);
      // Si gérant a ≥ 50 % (majoritaire), risque TNS sur >10 %
      return score + (pct >= 50 ? 0.1 : 0.5);
    }
    // Autres formes IS : bonus standard
    if (['SELARL', 'SCA'].includes(statusId)) return score + 0.5;
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'dividends_tns_penalty_sarl_eurl',
  description: 'Dividendes TNS : pénalité EURL / SARL (gérant majoritaire)',
  condition: answers => answers.remuneration_preference === 'dividends',
  apply: (statusId, score, answers, metrics) => {
    if (statusId === 'EURL') return score - 0.5; // TNS par nature
    if (statusId === 'SARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score - 0.5;
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'salary_preference_is',
  description: 'Préférence salaire : favorable aux formes IS (déductible)',
  condition: answers => answers.remuneration_preference === 'salary',
 apply: (statusId, score, answers, metrics) => {
    // Le “salaire” du dirigeant est une charge déductible en société à l’IS
    if (['SASU', 'SAS', 'SA', 'SARL', 'EURL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) return score + 0.75;
    // En EI/MICRO, les “prélèvements” ne sont pas déductibles → pas de bonus
    return score;
  },
  criteria: 'taxation_optimization'
},

{
  id: 'profit_reinvestment_is_bonus',
  description: 'Réinvestissement des bénéfices : avantage IS',
  condition: (a) => isYes(a.profit_reinvestment),
  apply: (statusId, score) => {
    if (['SASU','SAS','SA','SARL','EURL','SELARL','SELAS','SCA'].includes(statusId)) return score + 0.5;
    return score;
  },
  criteria: 'taxation_optimization'
},
{
  id: 'innovation_devices_bonus',
  description: 'Dispositifs innovation (JEI/CIR/CII)',
  condition: answers => Array.isArray(answers.jei_cir_cii) && answers.jei_cir_cii.length > 0,
  apply: (statusId, score, answers, metrics) => {
    // Structures IS les plus usuelles pour ces dispositifs
    if (['SASU', 'SAS', 'SARL', 'EURL', 'SA', 'SELAS', 'SELARL'].includes(statusId)) return score + 0.5;
    // MICRO/EI : souvent inadapté (procédures, base imposable, etc.)
    if (['MICRO', 'EI'].includes(statusId)) return score - 0.25;
    return score;
  },
  criteria: 'taxation_optimization'
},
    
 // RÈGLES — CHARGES SOCIALES (MAJ 30/09/2025)

{
  id: 'tns_preference_bonus',
  description: 'Préférence TNS favorable',
  condition: answers => answers.social_regime === 'tns',
 apply: (statusId, score, answers, metrics) => {
    if (['EI', 'MICRO', 'EURL'].includes(statusId)) return score + 1;
    // SARL/SELARL : bonus TNS pertinent seulement si gérant majoritaire (règles dédiées ci-dessous)
    return score;
  },
  criteria: 'social_charges'
},

{
  id: 'sarl_majoritaire_tns_bonus',
  description: 'SARL gérant majoritaire = TNS : bonus si préférence TNS',
  condition: answers =>
    answers.social_regime === 'tns' &&
    parseFloat(answers.capital_percentage ?? 0) >= 50,
  apply: (statusId, score) => (statusId === 'SARL' ? score + 1 : score),
  criteria: 'social_charges'
},

{
  id: 'sarl_minoritaire_tns_malus',
  description: 'SARL gérant minoritaire/égalitaire = assimilé : malus si préférence TNS',
  condition: answers =>
    answers.social_regime === 'tns' &&
    parseFloat(answers.capital_percentage ?? 0) < 50,
  apply: (statusId, score) => (statusId === 'SARL' ? score - 0.5 : score),
  criteria: 'social_charges'
},

{
  id: 'selarl_majoritaire_tns_bonus',
  description: 'SELARL gérant majoritaire = TNS : bonus si préférence TNS',
  condition: answers =>
    answers.social_regime === 'tns' &&
    parseFloat(answers.capital_percentage ?? 0) >= 50,
  apply: (statusId, score) => (statusId === 'SELARL' ? score + 1 : score),
  criteria: 'social_charges'
},

{
  id: 'employee_preference_bonus',
  description: 'Préférence assimilé salarié favorable',
  condition: answers => answers.social_regime === 'assimilated_employee',
 apply: (statusId, score, answers, metrics) => {
    if (['SASU', 'SAS', 'SA', 'SELAS', 'SCA'].includes(statusId)) return score + 1;
    // SARL/SELARL gérant minoritaire/égalitaire : bonus fin réglé ci-dessous
    return score;
  },
  criteria: 'social_charges'
},

{
  id: 'sarl_minoritaire_assimile_bonus',
  description: 'SARL gérant minoritaire/égalitaire = assimilé : bonus si préférence assimilé',
  condition: answers =>
    answers.social_regime === 'assimilated_employee' &&
    parseFloat(answers.capital_percentage ?? 0) < 50,
  apply: (statusId, score) => (statusId === 'SARL' ? score + 0.5 : score),
  criteria: 'social_charges'
},
{
  id: 'selas_assimile_preference',
  description: 'Libéral : SELAS pour régime assimilé salarié',
  condition: (a) => isYes(a.professional_order) && a.social_regime === 'assimilated_employee',
  apply: (statusId, score) => (statusId === 'SELAS' ? score + 1 : score),
  criteria: 'social_charges'
},
{
  id: 'low_income_micro_bonus',
  description: 'Faibles revenus favorables pour micro',
  condition: answers => parseFloat(answers.income_objective_year1 ?? 0) < 1500,
  apply: (statusId, score) => (statusId === 'MICRO' ? score + 1 : score),
  criteria: 'social_charges'
},

{
  id: 'low_income_tns_minima_malus',
  description: 'Très faibles revenus : malus TNS (cotisations minimales)',
  condition: answers => parseFloat(answers.income_objective_year1 ?? 0) < 1000,
  apply: (statusId, score, answers, metrics) => {
    if (['EI', 'EURL'].includes(statusId)) return score - 0.5;
    if (statusId === 'SARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score - 0.5;
    if (statusId === 'SELARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score - 0.5;
    return score;
  },
  criteria: 'social_charges'
},

{
  id: 'high_income_assimile_malus',
  description: 'Revenus élevés défavorables pour assimilé salarié',
  condition: answers => parseFloat(answers.income_objective_year1 ?? 0) > 5000,
  apply: (statusId, score) => (['SASU', 'SAS', 'SA', 'SELAS'].includes(statusId) ? score - 0.5 : score),
  criteria: 'social_charges'
},

{
  id: 'high_income_tns_bonus',
  description: 'Revenus élevés : TNS souvent plus économique (taux globaux inférieurs)',
  condition: answers => parseFloat(answers.income_objective_year1 ?? 0) > 5000,
  apply: (statusId, score, answers, metrics) => {
    if (['EI', 'EURL'].includes(statusId)) return score + 0.25;
    if (statusId === 'SARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score + 0.25;
    if (statusId === 'SELARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score + 0.25;
    return score;
  },
  criteria: 'social_charges'
},

{
  id: 'dividends_tns_social_malus',
  description: 'Dividendes > 10% (EURL / SARL gérant majoritaire) : cotisations TNS',
  condition: answers => answers.remuneration_preference === 'dividends',
 apply: (statusId, score, answers, metrics) => {
    if (statusId === 'EURL') return score - 0.5;
    if (statusId === 'SARL' && parseFloat(answers.capital_percentage ?? 0) >= 50) return score - 0.5;
    return score;
  },
  criteria: 'social_charges'
},
{
  id: 'zero_salary_strategy_assimile_bonus',
  description: 'Stratégie 0 salaire : charges nulles en assimilé (couverture dépendante)',
  condition: (a) =>
    (isYes(a.other_employee_job) || a.remuneration_preference === 'dividends') &&
    parseFloat(a.income_objective_year1 ?? 0) <= 500,
  apply: (statusId, score) =>
    ['SASU', 'SAS', 'SELAS', 'SA'].includes(statusId) ? score + 0.75 : score,
  criteria: 'social_charges'
},
{
  id: 'zero_salary_strategy_tns_malus',
  description: 'Stratégie 0 salaire : minima TNS à supporter',
  condition: (a) =>
    (isYes(a.other_employee_job) || a.remuneration_preference === 'dividends') &&
    parseFloat(a.income_objective_year1 ?? 0) <= 500,
  apply: (statusId, score, a) => {
    if (['EI', 'EURL'].includes(statusId)) return score - 0.5;
    if (statusId === 'SARL' && parseFloat(a.capital_percentage ?? 0) >= 50) return score - 0.5;
    if (statusId === 'SELARL' && parseFloat(a.capital_percentage ?? 0) >= 50) return score - 0.5;
    return score;
  },
  criteria: 'social_charges'
},
{
  id: 'acre_bonus',
  description: 'ACRE : exonération partielle temporaire',
  condition: a => isYes(a.acre),
  apply: (_statusId, score) => score + 0.5,
  criteria: 'social_charges'
},

{
  id: 'acre_micro_extra_bonus',
  description: 'ACRE en micro : allègement de taux sur 12 mois',
  condition: (a) => isYes(a.acre),
  apply: (statusId, score) => (statusId === 'MICRO' ? score + 0.25 : score),
  criteria: 'social_charges'
},

// RÈGLES — CAPACITÉ DE FINANCEMENT (MAJ 30/09/2025)

{
  id: 'fundraising_sas_sa_bonus',
  description: 'Levée de fonds favorable pour SAS/SASU/SA',
  condition: (a) => isYes(a.fundraising),
  apply: (statusId, score) => {
    if (['SASU', 'SAS', 'SA'].includes(statusId)) return score + 1.5;
    if (['SARL', 'EURL'].includes(statusId)) return score + 0.5;
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'sharing_instruments_bonus',
  description: 'Instruments de partage (BSPCE, BSA AIR, AGA…)',
  condition: (answers) =>
    Array.isArray(answers?.sharing_instruments) && answers.sharing_instruments.length > 0,
  apply: (statusId, score, answers, metrics) => {
    const hasBSPCE = (answers?.sharing_instruments || []).includes('BSPCE');
    const hasBSAair = (answers?.sharing_instruments || []).includes('BSA_AIR');
    const hasAGA   = (answers?.sharing_instruments || []).includes('AGA');

    let delta = 0;
    if (['SASU', 'SAS', 'SA', 'SELAS'].includes(statusId)) {
      if (hasBSPCE) delta += 1;
      if (hasBSAair) delta += 0.75;
      if (hasAGA)   delta += 0.5;
    }
    return score + delta;          // ← manquait
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'investors_ei_micro_malus',
  description: 'Investisseurs en capital : défavorable pour EI/MICRO/SNC',
  condition: answers => answers.team_structure === 'investors',
  apply: (statusId, score, answers, metrics) => {
    if (['EI', 'MICRO', 'SNC'].includes(statusId)) return score - 2;
    if (statusId === 'SCI') return score - 1; // peu adaptée à l’equity généraliste
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'liberal_fundraising_selas',
  description: 'Libéral réglementé : levée de fonds favorise SELAS',
  condition: (a) => isYes(a.professional_order) && isYes(a.fundraising),
  apply: (statusId, score) => {
    if (statusId === 'SELAS') return score + 1.5;
    if (statusId === 'SELARL') return score + 0.5;
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'crowdfunding_equity_bonus',
  description: 'Crowdfunding equity (plateformes) favorable aux sociétés par actions',
  condition: (a) => isYes(a.crowdfunding_equity),
  apply: (statusId, score) => {
    if (['SASU', 'SAS'].includes(statusId)) return score + 0.75;
    if (statusId === 'SA') return score + 0.5;
    if (['SARL', 'EURL'].includes(statusId)) return score + 0.25;
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'bank_debt_bonus',
  description: 'Dette bancaire : crédibilité des formes sociétaires',
  condition: (a) => isYes(a.bank_debt),
  apply: (statusId, score, a) => {
    if (['SA', 'SAS', 'SARL', 'EURL'].includes(statusId)) return score + 0.5;
    if (statusId === 'SASU') return score + 0.4;
    if (statusId === 'EI') return score + 0.25;
    if (statusId === 'MICRO') return score + 0.1;
    if (statusId === 'SCI' && String(a.activity_sector).toLowerCase() === 'real_estate') return score + 0.5; // hypothèque/adossement immo
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'many_investors_bonus_sas',
  description: 'Nombre élevé d’investisseurs (angel/seed) → SAS/SA',
  condition: answers => parseInt(answers.investors_count ?? answers.associates_number ?? 0, 10) > 20,
  apply: (statusId, score, answers, metrics) => {
    if (['SAS', 'SA'].includes(statusId)) return score + 0.75;
    if (['SARL', 'EURL'].includes(statusId)) return score - 0.25; // agrément et formalisme
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'foreign_investors_bonus',
  description: 'Investisseurs étrangers : préférence SAS/SA (souplesse/pactes)',
  condition: answers => answers.investor_origin === 'international',
  apply: (statusId, score) => (['SAS', 'SASU', 'SA'].includes(statusId) ? score + 0.75 : score),
  criteria: 'fundraising_capacity'
},

{
  id: 'ipo_path_sa_bonus',
  description: 'Projet de cotation (IPO) : avantage SA',
  condition: (a) => isYes(a.ipo_path),
  apply: (statusId, score) => {
    if (statusId === 'SA')  return score + 2;
    if (statusId === 'SAS') return score + 0.5; // transformation en SA anticipable
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'control_preservation_sas_bonus',
  description: 'Préservation du contrôle via actions de préférence / pactes',
  condition: (a) =>
    isYes(a.fundraising) &&
    ['important','essential'].includes(String(a.control_preservation || '').toLowerCase()),
  apply: (statusId, score) => {
    if (['SAS', 'SASU'].includes(statusId)) return score + 0.5; // grande liberté statutaire
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'sca_family_control_with_investors',
  description: 'SCA : contrôle familial + investisseurs externes',
  condition: (a) =>
    isYes(a.family_project) &&
    isYes(a.fundraising) &&
    String(a.control_preservation || '').toLowerCase() === 'essential',
  apply: (statusId, score) => (statusId === 'SCA' ? score + 2 : score),
  criteria: 'governance_flexibility'
},

{
  id: 'holding_topco_bonus',
  description: 'Holding de tête pour levées successives (topco) : SAS/SA',
  condition: (a) => isYes(a.holding_company) && isYes(a.fundraising),
  apply: (statusId, score) => (['SAS', 'SA'].includes(statusId) ? score + 0.5 : score),
  criteria: 'fundraising_capacity'
},

{
  id: 'vc_preference_bonus',
  description: 'VC/business angels : préférence SAS/SA, SARL/EURL moins adaptée',
  condition: answers => ['vc', 'business_angels', 'mixed'].includes(answers.investor_type),
  apply: (statusId, score, answers, metrics) => {
    if (['SAS', 'SA'].includes(statusId)) return score + 1;
    if (['SARL', 'EURL'].includes(statusId)) return score - 0.25;
    return score;
  },
  criteria: 'fundraising_capacity'
},

{
  id: 'real_estate_equity_malus_sci',
  description: 'Equity hors immobilier : SCI inadaptée',
  condition: (a) =>
    String(a.activity_sector || '').toLowerCase() !== 'real_estate' &&
    isYes(a.fundraising),
  apply: (statusId, score) => (statusId === 'SCI' ? score - 1 : score),
  criteria: 'fundraising_capacity'
},

{
  id: 'employee_share_plan_bonus',
  description: 'Plan d’actionnariat salarié : sociétés par actions avantagées',
  condition: (a) => isYes(a.employee_share_plan),
  apply: (statusId, score) =>
    (['SAS', 'SASU', 'SA', 'SELAS'].includes(statusId) ? score + 0.5 : score),
  criteria: 'fundraising_capacity'
},

 // RÈGLES — TRANSMISSION (MAJ 30/09/2025)

{
  id: 'sale_exit_bonus',
  description: 'Sortie par vente – sociétés commerciales',
  condition: answers => answers.exit_intention === 'sale',
apply: (statusId, score, answers, metrics) => {
    if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) return score + 1;
    return score;
  },
  criteria: 'transmission'
},
  {
  id: 'immo_transmission_priority_sci',
  description: 'Transmission immo prioritaire : SCI renforcée',
  condition: a => a.activity_type === 'immobilier'
            && a.exit_intention === 'transmission'
            && Array.isArray(a.priorities)
            && a.priorities.map(p => String(p).toLowerCase()).includes('transmission'),
  apply: (statusId, score) => statusId === 'SCI' ? score + 0.75 : score,
  criteria: 'transmission'
},

{
  id: 'sale_exit_ei_bonus',
  description: 'Vente de fonds (cession EI) – bonus modéré',
  condition: answers => answers.exit_intention === 'sale',
  apply: (statusId, score) => (statusId === 'EI' ? score + 0.5 : score),
  criteria: 'transmission'
},

{
  id: 'transmission_exit_bonus',
  description: 'Sortie par transmission – sociétés commerciales',
  condition: answers => answers.exit_intention === 'transmission',
  apply: (statusId, score) => (['SAS', 'SA', 'SARL'].includes(statusId) ? score + 1 : score),
  criteria: 'transmission'
},
{
  id: 'family_transmission_sarl_bonus',
  description: 'Transmission familiale : bonus SARL',
  condition: (a) => isYes(a.family_transmission),
  apply: (statusId, score) => (statusId === 'SARL' ? score + 0.5 : score),
  criteria: 'transmission'
},

{
  id: 'sci_family_transmission_bonus',
  description: 'SCI : transmission familiale facilitée (immobilier)',
  condition: (a) => isYes(a.family_transmission),
  apply: (statusId, score, a) => {
    if (statusId !== 'SCI') return score;
    const isRE = String(a.activity_sector || '').toLowerCase() === 'real_estate';
    // +1 si projet immo, sinon +0.5 (gestion patrimoniale)
    return score + (isRE ? 1 : 0.5);
  },
  criteria: 'transmission'
},

{
  id: 'micro_transmission_malus',
  description: 'Transmission/vente moins favorable en micro',
  condition: answers => ['sale', 'transmission'].includes(answers.exit_intention),
  apply: (statusId, score) => (statusId === 'MICRO' ? score - 0.75 : score),
  criteria: 'transmission'
},

{
  id: 'dutreil_eligible_bonus',
  description: 'Pacte Dutreil (donation/succession) – bonus formes éligibles',
  condition: (a) =>
    (String(a.exit_intention || '').toLowerCase() === 'transmission' ||
     String(a.exit_intention || '').toLowerCase() === 'gift') &&
    isYes(a.family_transmission),
  apply: (statusId, score) => {
    // EI (fonds exploité) et titres de sociétés opérationnelles
    const eligible = ['EI','SARL','EURL','SAS','SASU','SA','SELARL','SELAS'];
    return eligible.includes(statusId) ? score + 1.25 : score;
  },
  criteria: 'transmission'
},

{
  id: 'liberal_transmission_sel_bonus',
  description: 'Libéral réglementé : transmission facilitée via SEL',
  condition: (a) => isYes(a.professional_order) &&
                    String(a.exit_intention || '').toLowerCase() === 'transmission',
  apply: (statusId, score) => {
    if (statusId === 'SELAS') return score + 0.75;
    if (statusId === 'SELARL') return score + 0.5;
    return score;
  },
  criteria: 'transmission'
},

{
  id: 'mbo_lbo_bonus',
  description: 'Reprise par management (MBO/LBO) – sociétés par actions/SARL',
  condition: (a) => isYes(a.mbo_lbo),
  apply: (statusId, score) => {
    if (['SAS','SASU','SA'].includes(statusId)) return score + 1;
    if (['SARL','EURL'].includes(statusId))    return score + 0.5;
    return score;
  },
  criteria: 'transmission'
},

{
  id: 'share_deal_bonus_sas_sa',
  description: 'Préférence pour cession de titres (share deal)',
  condition: answers => answers.sale_mode === 'shares', // 'shares' | 'assets'
  apply: (statusId, score) => (['SAS','SASU','SA'].includes(statusId) ? score + 0.5 : score),
  criteria: 'transmission'
},

{
  id: 'asset_deal_bonus_ei_sarl',
  description: 'Préférence pour cession de fonds/actifs (asset deal)',
  condition: answers => answers.sale_mode === 'assets', // 'shares' | 'assets'
  apply: (statusId, score, answers, metrics) => {
    if (['EI','SARL','EURL'].includes(statusId)) return score + 0.5;
    if (statusId === 'SCI' && answers.activity_sector === 'real_estate') return score + 0.5;
    return score;
  },
  criteria: 'transmission'
},

{
  id: 'third_party_sale_sarl_malus',
  description: 'Vente à un tiers : agrément des parts (SARL/EURL) défavorable',
  condition: answers => answers.exit_intention === 'sale' && answers.buyer_type === 'third_party',
  apply: (statusId, score) => (['SARL','EURL'].includes(statusId) ? score - 0.25 : score),
  criteria: 'transmission'
},

{
  id: 'many_heirs_shares_bonus',
  description: 'Plusieurs héritiers : souplesse de répartition via titres',
  condition: answers => parseInt(answers.heirs_count ?? 0, 10) >= 2 && answers.exit_intention === 'transmission',
  apply: (statusId, score, answers, metrics) => {
    if (['SAS','SA'].includes(statusId)) return score + 0.5;
    if (statusId === 'SCI' && answers.activity_sector === 'real_estate') return score + 0.5;
    return score;
  },
  criteria: 'transmission'
},

{
  id: 'family_control_sca_bonus',
  description: 'Contrôle familial pérenne dans la transmission',
  condition: answers => answers.exit_intention === 'transmission' && answers.control_preservation === 'essential',
  apply: (statusId, score) => (statusId === 'SCA' ? score + 1.5 : score),
  criteria: 'transmission'
},

{
  id: 'holding_family_planning_bonus',
  description: 'Holding de famille (topco) pour transmissions échelonnées',
  condition: (a) => isYes(a.holding_company) &&
                    String(a.exit_intention || '').toLowerCase() === 'transmission',
  apply: (statusId, score) => (['SAS','SA','SARL'].includes(statusId) ? score + 0.5 : score),
  criteria: 'transmission'
},

{
  id: 'seller_retirement_bonus',
  description: 'Départ en retraite du cédant : focus sur la cession',
  condition: (a) => isYes(a.seller_retirement) &&
                    String(a.exit_intention || '').toLowerCase() === 'sale',
  apply: (statusId, score) => (['SASU','SAS','SA','SARL','EURL','EI'].includes(statusId) ? score + 0.5 : score),
  criteria: 'transmission'
},

// RÈGLES — PROFESSIONS LIBÉRALES RÉGLEMENTÉES (MAJ 30/09/2025)

// 1) Tes règles conservées (avec normalisation yes/no)
{
  id: 'regulated_profession_selarl_bonus',
  description: 'Libéral : SELARL pour profession réglementée',
  condition: (a) => isYes(a.professional_order) || isYes(a.regulated_profession),
  apply: (statusId, score) => {
    if (statusId === 'SELARL') return score + 2;                 // fort bonus SELARL
    if (['MICRO', 'EI', 'SNC'].includes(statusId)) return score - 1; // pénalité
    return score;
  },
  criteria: 'administrative_simplicity'
},

{
  id: 'regulated_profession_selas_bonus',
  description: 'Libéral : SELAS (flexibilité de gouvernance)',
  condition: (a) =>
    isYes(a.professional_order) &&
    String(a.governance_flexibility || '').toLowerCase() === 'essential',
  apply: (statusId, score) => {
    if (statusId === 'SELAS') return score + 2;   // bonus principal
    if (statusId === 'SELARL') return score + 1;  // bonus secondaire
    return score;
  },
  criteria: 'governance_flexibility'
},

// 2) Formes commerciales "non-SEL" désavantageuses pour professions réglementées
{
  id: 'regulated_non_sel_malus',
  description: 'Prof. réglementée : malus si SAS/SASU/SARL/EURL non-SEL',
  condition: (a) => isYes(a.professional_order) || isYes(a.regulated_profession),
  apply: (statusId, score) => {
    if (['SAS','SASU','SARL','EURL'].includes(statusId)) return score - 1; // préférer SELAS/SELARL
    return score;
  },
  criteria: 'credibility'
},

// 3) Multi-associés : la SELAS prime pour la souplesse, SELARL en alternative
{
  id: 'regulated_multi_partners_bonus',
  description: 'Prof. réglementée à plusieurs : SELAS/SELARL favorisées',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    parseInt(a.associates_count ?? 1, 10) >= 2,
  apply: (statusId, score) => {
    if (statusId === 'SELAS') return score + 1;
    if (statusId === 'SELARL') return score + 0.75;
    return score;
  },
  criteria: 'governance_flexibility'
},

// 4) Choix du régime social souhaité
{
  id: 'regulated_tns_preference_selarl',
  description: 'Libéral réglementé + préférence TNS → SELARL',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    String(a.social_regime || '').toLowerCase() === 'tns',
  apply: (statusId, score) => (statusId === 'SELARL' ? score + 1 : score),
  criteria: 'social_charges'
},

{
  id: 'regulated_assimile_preference_selas',
  description: 'Libéral réglementé + préférence assimilé salarié → SELAS',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    String(a.social_regime || '').toLowerCase() === 'assimilated_employee',
  apply: (statusId, score) => (statusId === 'SELAS' ? score + 1 : score),
  criteria: 'social_charges'
},

// 5) Démarrage prudent (micro-BNC) : petite tolérance si faible CA & année pilote
{
  id: 'regulated_micro_pilot_year_soft_bonus',
  description: 'Année pilote + faible CA : micro-BNC tolérée (bonus léger)',
  condition: (a) =>
    isYes(a.professional_order) &&
    isYes(a.pilot_year) &&
    parseFloat(a.income_objective_year1 ?? '0') < 30000,
  apply: (statusId, score) => (statusId === 'MICRO' ? score + 0.5 : score),
  criteria: 'administrative_simplicity'
},

// 6) Investisseurs externes (limités par l’ordre) : SELAS mieux adaptée
{
  id: 'regulated_investors_pref_selas',
  description: 'Investisseurs externes (quotas ordre) : avantage SELAS',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    String(a.team_structure || '').toLowerCase() === 'investors',
  apply: (statusId, score) => {
    if (statusId === 'SELAS') return score + 0.75;
    if (statusId === 'SELARL') return score + 0.25;
    return score;
  },
  criteria: 'fundraising_capacity'
},

// 7) SCI/SNC : formes inadaptées à l’exercice libéral
{
  id: 'regulated_sci_strong_malus',
  description: 'SCI inadaptée à l’exercice libéral : malus',
  condition: (a) => isYes(a.professional_order) || isYes(a.regulated_profession),
  apply: (statusId, score) => (statusId === 'SCI' ? score - 2 : score),
  criteria: 'credibility'
},
{
  id: 'regulated_snc_extra_malus',
  description: 'SNC (responsabilité illimitée) : malus pour prof. réglementées',
  condition: (a) => isYes(a.professional_order) || isYes(a.regulated_profession),
  apply: (statusId, score) => (statusId === 'SNC' ? score - 0.5 : score),
  criteria: 'patrimony_protection'
},

// 8) Protection du patrimoine essentielle : privilégier SEL (vs EI/MICRO)
{
  id: 'regulated_patrimony_protection_sel_bonus',
  description: 'Protection patrimoniale essentielle : SEL privilégiées',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    String(a.patrimony_protection || '').toLowerCase() === 'essential',
  apply: (statusId, score) => {
    if (['SELAS','SELARL'].includes(statusId)) return score + 0.75;
    if (['EI','MICRO'].includes(statusId)) return score - 0.5;
    return score;
  },
  criteria: 'patrimony_protection'
},

// 9) Croissance multi-site / groupe : SELAS recommandée
{
  id: 'regulated_multi_site_selas_bonus',
  description: 'Cabinet multi-site / structuration de groupe : SELAS +',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    isYes(a.multi_site),
  apply: (statusId, score) => (statusId === 'SELAS' ? score + 0.5 : score),
  criteria: 'governance_flexibility'
},

// 10) Dispositifs de partage (BSPCE/AGA…) quand éligible : avantage SELAS
{
  id: 'regulated_sharing_instruments_selas',
  description: 'Instruments d’intéressement/attraction talents : SELAS +',
  condition: (a) =>
    (isYes(a.professional_order) || isYes(a.regulated_profession)) &&
    Array.isArray(a.sharing_instruments) &&
    a.sharing_instruments.length > 0,
  apply: (statusId, score) => (statusId === 'SELAS' ? score + 0.5 : score),
  criteria: 'fundraising_capacity'
},

// 11) Activité principalement médicale (TVA souvent exonérée) : focus sécurité sociale
{
  id: 'regulated_healthcare_assimile_hint',
  description: 'Actes médicaux (souvent hors TVA) : préférence protection sociale',
  condition: (a) =>
    isYes(a.professional_order) &&
    String(a.activity_sector || '').toLowerCase() === 'healthcare',
  apply: (statusId, score) => {
    if (statusId === 'SELAS' && String(a.social_regime || '').toLowerCase() === 'assimilated_employee') return score + 0.5;
    if (statusId === 'SELARL' && String(a.social_regime || '').toLowerCase() === 'tns') return score + 0.25;
    return score;
  },
  criteria: 'social_charges'
},


  // RÈGLES — ACTIVITÉ IMMOBILIÈRE (MAJ 30/09/2025)

// 0) Aides de lecture côté données (toutes facultatives : si absentes, la règle ne s'applique pas)
// answers.real_estate_model ∈ ['patrimonial_nue','meuble','para_hotel','marchand','promotion','lotissement','bureaux_nus']
// answers.family_project ∈ ['yes','no']
// answers.bank_financing ∈ ['yes','no']
// answers.income_objective_year1 : number (€, pour jauger "petite activité meublée")
// --- 0) TYPE DE BIENS (résidentiel / commercial / mixte) -----------------
  {
    id: 'immo_property_use_residential_sci_bonus',
    description: 'Biens résidentiels (location nue) : SCI ++',
    condition: (a) =>
      IS_IMMO(a)
      && ['patrimonial_nue','bureaux_nus', null, undefined].includes(a.real_estate_model ?? null)
      && a.real_estate_property_use === 'residential',
    apply: (statusId, score) => (statusId === 'SCI' ? score + 0.5 : score),
    criteria: 'administrative_simplicity'
  },
  {
    id: 'immo_property_use_commercial_credit_boost',
    description: 'Biens commerciaux/pro : + SCI/SARL/SAS (baux + crédibilité), - EI/Micro',
    condition: (a) =>
      IS_IMMO(a)
      && ['patrimonial_nue','bureaux_nus', null, undefined].includes(a.real_estate_model ?? null)
      && a.real_estate_property_use === 'commercial',
    apply: (statusId, score) => {
      if (['SCI','SARL','SAS'].includes(statusId)) return score + 0.5;
      if (['EI','MICRO'].includes(statusId)) return score - 0.25;
      return score;
    },
    criteria: 'credibility'
  },
  {
    id: 'immo_property_use_mixed_governance',
    description: 'Biens mixtes : souplesse utile (SAS/SARL +)',
    condition: (a) =>
      IS_IMMO(a)
      && ['patrimonial_nue','bureaux_nus', null, undefined].includes(a.real_estate_model ?? null)
      && a.real_estate_property_use === 'mixed_use',
    apply: (statusId, score) => {
      if (['SAS','SARL'].includes(statusId)) return score + 0.5;
      return score;
    },
    criteria: 'governance_flexibility'
  },

  // --- 1) IMMOBILIER PATRIMONIAL (NU) --------------------------------------
  {
    id: 'immobilier_activity_sci_mega_bonus',
    description: 'Immobilier patrimonial (nu) : SCI fortement recommandée',
    condition: (a) =>
      IS_IMMO(a)
      && ['patrimonial_nue','bureaux_nus', null, undefined].includes(a.real_estate_model ?? null),
    apply: (statusId, score) => {
      if (statusId === 'SCI') return score + 3;
      if (['MICRO','EI'].includes(statusId)) return score - 1;
      return score;
    },
    criteria: 'administrative_simplicity'
  },
  {
    id: 'immo_distribution_sci_ir',
    description: 'Immo patrimonial (nu) : distribution par quotes-parts (SCI IR)',
    condition: (a) =>
      IS_IMMO(a)
      && ['patrimonial_nue','bureaux_nus', null, undefined].includes(a.real_estate_model)
      && ['dividends','mixed','flexible'].includes(a.remuneration_preference),
    apply: (statusId, score) => (statusId === 'SCI' ? score + 0.5 : score),
    criteria: 'taxation_optimization'
  },

  // --- 2) MEUBLÉ (LMNP/LMP) -------------------------------------------------
  {
    id: 'immobilier_meuble_pref_sarlfam_ei',
    description: 'Location meublée : + SARL (famille, IR) / EI / EURL, - SCI',
    condition: (a) => IS_IMMO(a) && a.real_estate_model === 'meuble',
    apply: (statusId, score, a) => {
      if (statusId === 'SCI')  return score - 2;
      if (statusId === 'SARL') return score + 1.25;
      if (statusId === 'EURL') return score + 0.75;
      if (statusId === 'EI')   return score + 0.75;
      if (statusId === 'MICRO') return score + (a?._meuble_small_activity ? 0.5 : 0.25);
      return score;
    },
    criteria: 'taxation_optimization'
  },

  // --- 3) PARA-HÔTELIER -----------------------------------------------------
  {
    id: 'immobilier_parahotelier_pref_societes_commerciales',
    description: 'Para-hôtelier : SAS/SARL préférées, SCI dissuadée',
    condition: (a) => IS_IMMO(a) && a.real_estate_model === 'para_hotel',
    apply: (statusId, score) => {
      if (statusId === 'SCI')  return score - 2;
      if (statusId === 'SAS')  return score + 1.5;
      if (statusId === 'SARL') return score + 1;
      if (statusId === 'SASU') return score + 1;
      return score;
    },
    criteria: 'credibility'
  },

  // --- 4) MARCHAND / PROMOTION / LOTISSEMENT --------------------------------
  {
    id: 'immobilier_marchand_promo_pref_sas_sarl',
    description: 'Marchand de biens / promo : SAS/SARL ++ ; SCI fortement déconseillée',
    condition: (a) => IS_IMMO(a) && ['marchand','promotion','lotissement'].includes(a.real_estate_model),
    apply: (statusId, score) => {
      if (statusId === 'SCI')  return score - 3;
      if (statusId === 'SNC')  return score - 1;
      if (statusId === 'SAS')  return score + 2;
      if (statusId === 'SARL') return score + 1.5;
      if (statusId === 'SASU') return score + 1.25;
      if (statusId === 'SA')   return score + 1;
      return score;
    },
    criteria: 'governance_flexibility'
  },

  // --- 5) PLUSIEURS ASSOCIÉS -------------------------------------------------
  {
    id: 'multiple_partners_bonus_collective',
    description: 'Plusieurs associés : bonus pour gestion collective',
    condition: (a) =>
      ['family','associates','investors'].includes(a.team_structure)
      && parseInt(a.associates_number || 2, 10) >= 2,
    apply: (statusId, score) => {
      if (['SARL','SNC','SCI'].includes(statusId)) return score + 0.75;
      if (['SASU','EURL','EI'].includes(statusId)) return score - 0.75;
      return score;
    },
    criteria: 'governance_flexibility'
  },

  // --- 6) SOLO ---------------------------------------------------------------
  {
    id: 'solo_project_penalty_multi_partner_statutes',
    description: 'Projet solo : pénalise statuts qui exigent ≥ 2 associés',
    condition: (a) => a.team_structure === 'solo',
    apply: (statusId, score) => (['SNC','SCI','SARL'].includes(statusId) ? score - 1 : score),
    criteria: 'governance_flexibility'
  },

  // --- 7) GOUVERNANCE SUR-MESURE --------------------------------------------
  {
    id: 'flexible_statutes_bonus',
    description: 'Gouvernance sur-mesure : bonus SAS / SASU / SELAS / SCA',
    condition: (a) => ['complex','moderate'].includes(a.governance_complexity),
    apply: (statusId, score) => {
      if (['SAS','SASU','SELAS','SCA'].includes(statusId)) return score + 1;
      if (['SARL','SNC','SCI','EI','MICRO'].includes(statusId)) return score - 0.5;
      return score;
    },
    criteria: 'governance_flexibility'
  },

  // --- 8) GOUVERNANCE TRÈS SIMPLE -------------------------------------------
  {
    id: 'simple_governance_penalty_flexible_statutes',
    description: 'Gouvernance très simple souhaitée : SAS / SCA moins pertinentes',
    condition: (a) => a.governance_complexity === 'simple',
    apply: (statusId, score) => (['SAS','SCA'].includes(statusId) ? score - 0.5 : score),
    criteria: 'governance_flexibility'
  },

  // --- 9) IMMO + PROJET FAMILIAL --------------------------------------------
  {
  id: 'immobilier_family_project_sci_bonus',
  description: 'Immobilier familial : SCI ++ (agréments, démembrement, transmission)',
  condition: (a) =>
    typeof IS_IMMO === 'function' &&
    IS_IMMO(a) &&
    isYes(a.family_project) &&
    ['patrimonial_nue', 'bureaux_nus'].includes(String(a.real_estate_model ?? 'patrimonial_nue')),
  apply: (statusId, score) => (statusId === 'SCI' ? score + 1 : score),
  criteria: 'transmission'
},

  // --- 10) INVESTISSEURS EXTERNES -------------------------------------------
  {
    id: 'immobilier_investors_pref_sas_sca',
    description: 'Investisseurs externes : SAS (souplesse) ou SCA (contrôle familial)',
    condition: (a) => IS_IMMO(a) && a.team_structure === 'investors',
    apply: (statusId, score) => {
      if (statusId === 'SAS') return score + 1.25;
      if (statusId === 'SCA') return score + 1;
      if (statusId === 'SCI') return score + 0.25; // toléré en patrimonial simple
      return score;
    },
    criteria: 'fundraising_capacity'
  },

  // --- 11) FINANCEMENT BANCAIRE ---------------------------------------------
  {
  id: 'immobilier_bank_financing_bonus',
  description: 'Financement bancaire : + SCI/SARL/SAS, - MICRO/EI',
  condition: (a) =>
    typeof IS_IMMO === 'function' &&
    IS_IMMO(a) &&
    isYes(a.bank_financing),
  apply: (statusId, score) => {
    if (['SCI', 'SARL', 'SAS'].includes(statusId)) return score + 0.75;
    if (['MICRO', 'EI'].includes(statusId))       return score - 0.5;
    return score;
  },
  criteria: 'credibility'
}
];
    
window.scoringRules = scoringRules;

class RecommendationEngine {
  constructor() {
    console.log("Initialisation du RecommendationEngine (MAJ 30/09/2025)");

    // Blindage du constructeur
    if (!window.legalStatuses) {
      throw new Error("`window.legalStatuses` est introuvable – charge d’abord legal-status-data.js");
    }

    this.answers = {};
    this.filteredStatuses = { ...window.legalStatuses };
    this.scores = {};
    this.weightedScores = {};
    this.priorityWeights = {};
    this.incompatibles = []; // [{ statusId, code, explanation, alternatives }]
    this.auditTrail = { exclusions: [], weightingRules: [], scores: {} };

 // === SEUILS & RÉFÉRENTIELS — 2025 ===
this.thresholds2025 = {
  micro: {
    // Micro-BIC/BNC (LF 2025)
    bic_sales: 188_700,        // ventes / hébergement
    bic_service: 77_700,       // prestations de services BIC
    bnc: 77_700,               // BNC

    // Exception meublés de tourisme 2025 (abattements & plafonds spécifiques)
    meuble_classe_ca: 77_700,  // classé
    meuble_non_classe_ca: 15_000 // non classé
  },

  // IS réduit 15 % sous conditions (CA < 10 M€, plafond de bénéfice)
  is_reduced_rate: {
    profit_cap: 42_500,
    turnover_cap: 10_000_000
  },

  // Franchise en base de TVA (2025)
  tva_franchise_base: {
    ventes: 85_000,
    services: 37_500,
    tolerance_ventes: 93_500,
    tolerance_services: 41_250
  },

  // Contraintes de structure (min. d’associés)
  min_associates: {
    MICRO: 1, EI: 1, EURL: 1, SASU: 1,
    SARL: 2, SAS: 2, SNC: 2, SCI: 2,
    SA: 2, // 7 si cotée
    SELARL: 2, SELAS: 1, // SELASU possible
    SCA: 4 // 1 commandité + 3 commanditaires (≥7 si appel public)
  }
};

    // Alias rétrocompatibilité si ton code lit encore la clé initiale
    this.thresholds2025.is_reduced_rate_limit = this.thresholds2025.is_reduced_rate.profit_cap;

    // Cache mémo
    this.memoizedResults = {};

    // === ALTERNATIVES (2025) — étendues/clarifiées ===
    this.alternativeSuggestions = {
      MICRO: {
        'ca-depasse-seuil': {
          alternatives: ['EURL', 'SASU'],
          explanation: "Optez pour EURL ou SASU si votre CA dépasse les plafonds micro."
        },
        'ordre-professionnel': {
          alternatives: ['SELARL', 'SELAS'],
          explanation: "Pour une profession réglementée, privilégiez SELARL ou SELAS."
        },
        'fundraising': {
          alternatives: ['SAS', 'SASU'],
          explanation: "Pour lever des fonds, SAS / SASU sont bien adaptées."
        },
        'financement-bancaire-credibilite': {
          alternatives: ['SARL', 'SAS', 'SCI'],
          explanation: "Pour rassurer les banques, une société (SARL/SAS/SCI en immo) est plus crédible."
        }
      },

      EI: {
        'protection-patrimoine': {
          alternatives: ['EURL', 'SASU'],
          explanation: "Séparez mieux vos risques avec EURL ou SASU."
        },
        'levee-fonds': {
          alternatives: ['SASU', 'SAS'],
          explanation: "Pour accueillir des investisseurs, préférez SASU/SAS."
        },
        'financement-bancaire-credibilite': {
          alternatives: ['SARL', 'SAS'],
          explanation: "Structure sociétale souvent mieux perçue par les banques."
        }
      },

      /* ---------- ENTREPRISE UNIPERSONNELLE & DÉRIVÉS ---------- */
      EURL: {
        'ouverture-capital': {
          alternatives: ['SARL', 'SAS'],
          explanation: "Transformation en SARL/SAS pour faire entrer des associés."
        },
        'regime-social-tns-indesirable': {
          alternatives: ['SASU', 'SAS'],
          explanation: "Régime assimilé salarié via SASU/SAS."
        },
        'fundraising': {
          alternatives: ['SAS', 'SA'],
          explanation: "Pour des levées significatives, SAS ou SA."
        }
      },

      SASU: {
        'associe-unique-veut-sassocier': {
          alternatives: ['SAS', 'SARL'],
          explanation: "À l’arrivée d’un deuxième associé : SAS ou SARL."
        },
        'charges-sociales-elevees': {
          alternatives: ['EURL', 'MICRO'],
          explanation: "EURL (TNS) ou micro peuvent alléger le coût social."
        },
        'imposition-is-non-voulu': {
          alternatives: ['EURL', 'EI'],
          explanation:
            "SASU est à l’IS par défaut (option IR possible 5 exercices si éligible) ; sinon EURL/EI pour l’IR de plein droit."
        }
      },

      /* ---------- FORMES CLASSIQUES MULTI-ASSOCIÉS ---------- */
      SARL: {
        'gouvernance-rigide': {
          alternatives: ['SAS', 'SA'],
          explanation: "Plus de souplesse statutaire en SAS/SA."
        },
        'levee-fonds': {
          alternatives: ['SAS', 'SA'],
          explanation: "Les investisseurs préfèrent généralement SAS/SA."
        },
        'regime-social-tns-indesirable': {
          alternatives: ['SAS', 'SA'],
          explanation: "Pour éviter TNS (gérance majoritaire), passez en SAS/SA."
        }
      },

      SAS: {
        'associe-unique': {
          alternatives: ['SASU', 'EURL'],
          explanation: "S’il ne reste qu’un associé : SASU, ou EURL pour viser l’IR."
        },
        'petit-projet': {
          alternatives: ['EI', 'MICRO', 'EURL'],
          explanation: "Pour une très petite activité, privilégier les régimes simplifiés."
        },
        'activite-reglementee': {
          alternatives: ['SELARL', 'SELAS'],
          explanation: "Pour professions réglementées : SELARL/SELAS."
        }
      },

      SA: {
        'capital-insuffisant': {
          alternatives: ['SAS', 'SARL'],
          explanation: "Si < 37 000 € de capital : SAS/SARL."
        },
        'nombre-associes-insuffisant': {
          alternatives: ['SAS', 'SARL'],
          explanation: "Moins de 2 (ou 7 si cotée) : basculez en SAS/SARL."
        },
        'souplesse-gouvernance-voulue': {
          alternatives: ['SAS'],
          explanation: "SAS = liberté statutaire."
        }
      },

      /* ---------- FORMES SPÉCIFIQUES ---------- */
      SNC: {
        'risque-eleve': {
          alternatives: ['SARL', 'SAS'],
          explanation: "Responsabilité illimitée : préférez SARL/SAS."
        }
      },

      SCI: {
        'hors-immobilier': {
          alternatives: ['SARL', 'SAS', 'EURL', 'SASU'],
          explanation: "Pour une activité commerciale : SARL/SAS (ou EURL/SASU en solo)."
        },
        'meuble-habituel': {
          alternatives: ['SARL', 'EURL', 'EI'],
          explanation:
            "Meublé habituel inadapté en SCI à l’IR (risque d’IS). Préférez SARL de famille (IR), EURL ou EI (LMNP/LMP)."
        },
        'marchand-promotion': {
          alternatives: ['SAS', 'SARL', 'SASU'],
          explanation:
            "Marchand/promo = activité commerciale : SAS/SARL (SASU si solo) plutôt que SCI."
        },
        'financement-bancaire-credibilite': {
          alternatives: ['SCI', 'SARL', 'SAS'],
          explanation:
            "En immobilier, SCI/SARL/SAS rassurent mieux les banques que MICRO/EI."
        },
        'simplicite-comptable': {
          alternatives: ['EURL', 'SARL'],
          explanation: "Pour alléger le formalisme, EURL/SARL peuvent être plus simples à gérer."
        }
      },

      SELARL: {
        'fundraising': {
          alternatives: ['SELAS', 'SAS'],
          explanation: "Ouverture de capital facilitée en SELAS/SAS (sous règles ordinales)."
        },
        'besoin-flexibilite-gouvernance': {
          alternatives: ['SELAS', 'SAS'],
          explanation: "Gouvernance plus souple en SELAS/SAS."
        }
      },

      SELAS: {
        'non-reglemente': {
          alternatives: ['SAS', 'SARL'],
          explanation: "Sans ordre pro : SAS/SARL suffisent, moins de contraintes."
        },
        'regime-social-non-souhaite': {
          alternatives: ['SARL', 'EURL'],
          explanation: "Pour éviter l’assimilé salarié : SARL (TNS gérant maj.) / EURL."
        }
      },

      SCA: {
        'capital-insuffisant': {
          alternatives: ['SAS', 'SA'],
          explanation: "Si < 37 000 € (ou 225 000 € en appel public) : SAS/SA."
        },
        'petit-projet': {
          alternatives: ['SAS', 'SARL'],
          explanation: "SCA est lourde : préférer SAS/SARL."
        }
      }
    };
        console.log("RecommendationEngine initialisé avec succès");
    }

/**
 * Calculer les recommandations basées sur les réponses
 * @param {Object} answers - Les réponses au questionnaire
 */
calculateRecommendations(answers) {
  console.log("Début du calcul des recommandations (avant normalisation)", answers);

  // ── Normalisation des clés hétérogènes ─────────────────────────────
  const norm = { ...answers };
  const toYN = (v) => (v === true ? 'yes' : v === false ? 'no' : v);

  // --- Normalisation "dividendes" pour l'immobilier nu (SCI à l'IR)
  if (IS_IMMO?.(norm) && ['patrimonial_nue','bureaux_nus', null, undefined].includes(norm.real_estate_model)) {
    if (norm.remuneration_preference === 'dividends') {
      norm.remuneration_preference = 'distribution';
    }
  }

  // Unifie le nombre d'associés (conserve "inconnu" = null)
  const assocRaw = norm.associates_number ?? norm.associates_count ?? norm.investors_count;
  if (assocRaw == null || assocRaw === '') {
    norm.associates_number = null;
  } else {
    const parsed = parseInt(assocRaw, 10);
    norm.associates_number = Number.isFinite(parsed) ? parsed : null;
  }

  // Unifie la présence d'investisseurs
  norm.investors = toYN(
    norm.investors ?? (norm.team_structure === 'investors' ? 'yes' : 'no')
  );

  // Unifie les flags liés à la cotation / appel public à l’épargne
  norm.public_listing  = toYN(norm.public_listing);
  norm.public_offering = toYN(norm.public_offering);
  norm.ipo_path        = toYN(norm.ipo_path);
  norm.public_listing_or_aps = toYN(
    norm.public_listing_or_aps ?? (
      (norm.public_listing === 'yes' || norm.public_offering === 'yes' || norm.ipo_path === 'yes')
        ? 'yes' : 'no'
    )
  );

  // ── Dérivations et alias robustes (comblent les clés manquantes) ────────────
  /** expense_ratio: si l’utilisateur n’a pas répondu "taux de frais réels",
   * on approxime via la marge brute (1 - marge) quand dispo. */
  if (norm.expense_ratio == null) {
    const realRate = parseFloat(norm.real_expenses_rate);
    if (Number.isFinite(realRate)) {
      norm.expense_ratio = Math.max(0, Math.min(1, realRate / 100));
    } else if (Number.isFinite(parseFloat(norm.gross_margin))) {
      norm.expense_ratio = Math.max(0, Math.min(1, 1 - (parseFloat(norm.gross_margin) / 100)));
    }
  }

  // investor_type / crowdfunding_equity à partir de investors_type/checkbox
  if (!norm.investor_type && Array.isArray(norm.investors_type)) {
    if (norm.investors_type.includes('venture_capital')) norm.investor_type = 'vc';
    else if (norm.investors_type.includes('business_angels')) norm.investor_type = 'business_angels';
    else if (norm.investors_type.includes('crowdfunding')) norm.investor_type = 'crowdfunding';
  }
  if (norm.crowdfunding_equity == null) {
    norm.crowdfunding_equity = toYN(
      (Array.isArray(norm.investors_type) && norm.investors_type.includes('crowdfunding')) ? true : false
    );
  }

  // employee_share_plan: true si instruments de partage sélectionnés
  if (norm.employee_share_plan == null) {
    norm.employee_share_plan = toYN(Array.isArray(norm.sharing_instruments) && norm.sharing_instruments.length > 0);
  }

  // bank_debt: “oui” si un prêt >0 ou caution bancaire
  if (norm.bank_debt == null) {
    const loan = parseFloat(norm.bank_loan_amount || 0);
    norm.bank_debt = toYN((loan > 0) || isYes(norm.bank_guarantee));
  }

  // family_project: “oui” si team = famille
  if (norm.family_project == null) {
    norm.family_project = toYN(norm.team_structure === 'family');
  }

  // buyer_type: défaut 'third_party' (sera affiné si transmission familiale)
  if (!norm.buyer_type) {
    norm.buyer_type = isYes(norm.family_transmission) ? 'family' : 'third_party';
  }

  // heirs_count: valeur par défaut 0
  if (norm.heirs_count == null) norm.heirs_count = 0;

  // regulated_profession: miroir simplifié de professional_order
  if (norm.regulated_profession == null) {
    norm.regulated_profession = toYN(isYes(norm.professional_order));
  }

  // activity_sector: déduction large depuis activity_type
  if (!norm.activity_sector) {
    const at = String(norm.activity_type || '').toLowerCase();
    norm.activity_sector =
      (at === 'bnc' ? 'liberal' :
       at === 'immobilier' ? 'real_estate' :
       (at.includes('agric') ? 'agri' : 'commerce_service'));
  }

  // Harmoniser les IDs d’instruments (ex: règles attendent 'BSPCE'/'AGA'…)
  if (Array.isArray(norm.sharing_instruments)) {
    norm.sharing_instruments = norm.sharing_instruments.map(x => {
      const id = String(x).toLowerCase();
      if (id === 'bspce') return 'BSPCE';
      if (id === 'aga') return 'AGA';
      if (id === 'stock_options') return 'SO';
      if (id === 'bsa_air') return 'BSA_AIR';
      return x;
    });
  }

  // Autre emploi salarié (pour stratégie 0 salaire) – approximation depuis “other_income”
  if (norm.other_employee_job == null) {
    norm.other_employee_job = toYN(isYes(norm.other_income));
  }

  // ── MATRIMONIAL & CAUTIONS (normalisation + dérivés) ───────────────────────
  norm.marital_status            = norm.marital_status || 'single';
  norm.matrimonial_regime        = norm.matrimonial_regime || 'unknown'; // 'separation'|'community'|'universal_community'|'unknown'
  norm.apport_origin             = norm.apport_origin || null;           // 'personal_funds'|'community_funds'|'mixed'|null
  norm.personal_guarantee_scope  = norm.personal_guarantee_scope || 'no_preference'; // 'exclude_common'|'limit_common'|'no_preference'

  // Dérivés rapides
  norm._is_married   = String(norm.marital_status).toLowerCase() === 'married';
  norm._is_community = norm._is_married && ['community','universal_community'].includes(norm.matrimonial_regime);
  norm._is_sep       = norm._is_married && norm.matrimonial_regime === 'separation';

  // Parts potentiellement communes (utile pour transmission / risques)
  norm._shares_may_be_common =
    norm._is_community && (norm.apport_origin === 'community_funds' || norm.apport_origin === 'mixed');

  // Caution engageant (ou pouvant engager) des biens communs
  norm._bank_guarantee_common_scope =
    isYes(norm.bank_guarantee) && norm._is_community &&
    (norm.personal_guarantee_scope === 'no_preference' || norm.personal_guarantee_scope === 'limit_common');

  // Signal qualité d’info
  norm._matrimonial_unknown = norm._is_married && norm.matrimonial_regime === 'unknown';

  // ────────────────────────────────────────────────────────────────────────────
  console.log("Réponses normalisées", norm);

  // ── Mémoïsation avec les réponses normalisées ──────────────────────
  const answersKey = JSON.stringify(norm);
  if (this.memoizedResults[answersKey]) {
    console.log('Résultats récupérés du cache (après normalisation)');
    return this.memoizedResults[answersKey];
  }

  this.answers = norm;

  // Réinitialiser les résultats
  this.resetResults();

  // Appliquer les filtres d'exclusion
  this.applyExclusionFilters();

  // Calculer les poids des priorités
  this.calculatePriorityWeights();

  // Calculer les scores pour chaque statut juridique
  this.calculateScores();

  // Obtenir les recommandations finales (top 3)
  const recommendations = this.getTopRecommendations(3);

  // Afficher les résultats
  this.displayResults(recommendations);

  // Mémoïsation - stocker les résultats en cache (clé normalisée)
  this.memoizedResults[answersKey] = recommendations;

  console.log("Fin du calcul des recommandations", recommendations);
  return recommendations;
}
  
    /**
     * Réinitialiser les résultats pour un nouveau calcul
     */
    resetResults() {
        this.filteredStatuses = {...window.legalStatuses};
        this.scores = {};
        this.weightedScores = {};
        this.incompatibles = [];
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
    }

  /**
 * Appliquer les filtres d'exclusion pour éliminer certains statuts
 */
applyExclusionFilters() {
  // Appliquer les filtres déclaratifs
  this.applyDeclarativeFilters();

  // Appliquer les filtres spécifiques
  this.applySpecificFilters();

  console.log('Statuts après filtres:', Object.keys(this.filteredStatuses));
}

/**
 * Appliquer les filtres d'exclusion déclaratifs définis dans legal-status-data.js
 * - condition: string | function(answers) | RegExp | string[]
 * - tolerance_condition: string (clé dans answers) | function(answers)
 */
applyDeclarativeFilters() {
  const filters = Array.isArray(window.exclusionFilters) ? window.exclusionFilters : [];

  filters.forEach(filter => {
    let shouldExclude = false;

    try {
      const cond = filter?.condition;
      const id = filter?.id;

      if (typeof cond === 'string') {
        // Match exact sur la valeur de answers[id]
        shouldExclude = (this.answers?.[id] === cond);
      } else if (typeof cond === 'function') {
        // On passe l'objet answers **entier**
        shouldExclude = !!cond(this.answers);
      } else if (cond instanceof RegExp) {
        // Test regex sur answers[id] (stringifié)
        const val = this.answers?.[id];
        shouldExclude = cond.test(String(val ?? ''));
      } else if (Array.isArray(cond)) {
        // Inclusion dans une liste de valeurs
        shouldExclude = cond.includes(this.answers?.[id]);
      }
    } catch (e) {
      console.error(`Erreur dans le filtre ${filter?.id}:`, e);
    }

    // Tolérance éventuelle (clé booléenne ou fonction)
    if (shouldExclude && filter?.tolerance_condition) {
      try {
        const tol = filter.tolerance_condition;
        if (typeof tol === 'function') {
          if (tol(this.answers)) shouldExclude = false;
        } else if (typeof tol === 'string') {
          if (this.answers?.[tol]) shouldExclude = false;
        }
      } catch (e) {
        console.error(`Erreur dans la tolérance du filtre ${filter?.id}:`, e);
      }
    }

    // Si la condition est remplie, exclure les statuts spécifiés
    if (shouldExclude) {
      const list = Array.isArray(filter?.excluded_statuses) ? filter.excluded_statuses.filter(Boolean) : [];
      if (list.length) {
        this.excludeStatuses(
          list,
          // message priorité: tolerance_message > reason > message > fallback
          filter?.tolerance_message || filter?.reason || filter?.message || `Exclusion par règle: ${filter?.id}`
        );
      }
    }
  });
}
    
/**
 * Appliquer les filtres d'exclusion spécifiques (cas particuliers) — MAJ 30/09/2025
 */
applySpecificFilters() {
  // Helper yes/no (utilise celui global si dispo)
  const isYes = (this && typeof this.isYes === 'function')
    ? this.isYes
    : (v => String(v).toLowerCase() === 'yes');

  // ─── Données dérivées ──────────────────────────────────────────────
  const A = this.answers || {};
  const teamSolo = String(A.team_structure || '').toLowerCase() === 'solo';

  // Nombre d’associés (null si inconnu)
  const nbAssocParsed = parseInt(A.associates_number, 10);
  const nbAssoc = Number.isFinite(nbAssocParsed) ? nbAssocParsed : null;

  // Capital disponible (null si inconnu)
  const capParsed = parseFloat(A.available_capital);
  const capital = Number.isFinite(capParsed) ? capParsed : null;

  // CA prévisionnel (null si inconnu)
  const revenueParsed = parseFloat(A.projected_revenue);
  const revenue = Number.isFinite(revenueParsed) ? revenueParsed : null;

  // Type d'ordre pro (string minuscule, peut être vide)
  const orderType = String(A.professional_order_type || A.order_type || '').toLowerCase();

  // Immobilier ? (helper optionnel + fallback simple)
  const IS_IMMO_LOCAL = (typeof IS_IMMO === 'function')
    ? IS_IMMO
    : (x => (typeof window?.isRealEstateSector === 'function')
        ? window.isRealEstateSector(x)
        : String(x?.activity_type || '').toLowerCase() === 'immobilier');

  const isImmo = IS_IMMO_LOCAL(A);

  // Référentiels + fallbacks
  const TH = this.thresholds2025 || {};
  const MICRO = (TH.micro || {
    bic_sales: 188_700, bic_service: 77_700, bnc: 77_700,
    meuble_classe_ca: 77_700, meuble_non_classe_ca: 15_000
  });

  // Helper micro (utilise le helper externe s’il existe, sinon fallback local)
  const microThreshold = (() => {
    if (typeof this?._getMicroCeilingForAnswers === 'function') {
      const val = this._getMicroCeilingForAnswers(A);
      if (Number.isFinite(val)) return val;
    }
    // Fallback : calcule selon l’activité
    if (isImmo && ['meuble', 'meublé'].includes(String(A.real_estate_model || '').toLowerCase())) {
      return isYes(A.furnished_tourism_classed)
        ? MICRO.meuble_classe_ca       // 77 700 €
        : MICRO.meuble_non_classe_ca;  // 15 000 €
    }
    const nature = String(
      A.activity_nature || A.activity_category || A.activity_type || ''
    ).toLowerCase();

    if (['ventes', 'hébergement', 'hebergement', 'bic_sales'].includes(nature)) {
      return MICRO.bic_sales;     // 188 700 €
    }
    if (nature === 'bnc') {
      return MICRO.bnc;           // 77 700 €
    }
    return MICRO.bic_service;     // 77 700 €
  })();

  /* ------------------------------------------------------------------
   * 1) Activité relevant d’un ordre professionnel
   *    → MICRO tolérée selon cas ; SNC exclue
   * ------------------------------------------------------------------ */
  if (isYes(A.professional_order) || isYes(A.regulated_profession)) {
    this.excludeStatus(
      'SNC',
      "Activité relevant d'un ordre professionnel – SNC exclue (responsabilité illimitée)"
    );
  }

  /* ------------------------------------------------------------------
   * 2) CA prévisionnel > seuil micro → MICRO exclue (incl. cas meublés 2025)
   * ------------------------------------------------------------------ */
  if (Number.isFinite(revenue) && Number.isFinite(microThreshold) && revenue > microThreshold) {
    this.excludeStatus(
      'MICRO',
      `CA prévisionnel (${revenue.toLocaleString('fr-FR')} €) > seuil micro (${microThreshold.toLocaleString('fr-FR')} €)`
    );
  }

  /* ------------------------------------------------------------------
   * 3) Besoin de lever des fonds → EI / MICRO / SNC exclus
   * ------------------------------------------------------------------ */
  if (isYes(A.fundraising) || isYes(A.investors)) {
    this.excludeStatuses(
      ['EI', 'MICRO', 'SNC'],
      'Levée de fonds envisagée – statuts peu attractifs exclus (préférez SAS/SASU/SA)'
    );
  }

  /* ------------------------------------------------------------------
   * 4) SEL réservées aux professions libérales réglementées (ordres)
   *    → si pas d’ordre/réglementation, SELARL/SELAS exclues
   * ------------------------------------------------------------------ */
  const hasOrder =
    isYes(A.professional_order) ||
    isYes(A.regulated_activity) ||
    isYes(A.regulated_profession);

  if (!hasOrder) {
    this.excludeStatuses(
      ['SELARL', 'SELAS'],
      'SEL réservées aux professions libérales réglementées (ordre/agréments requis)'
    );
  }

  /* ------------------------------------------------------------------
   * 5) SCI réservée aux activités civiles immobilières
   *    - Exclue si activité ≠ immobilier (via isImmo)
   *    - Exclue même en immobilier pour meublé habituel / para-hôtelier
   *      et pour marchand de biens / promotion / lotissement
   * ------------------------------------------------------------------ */
  if (!isImmo) {
    this.excludeStatus('SCI', 'SCI réservée aux activités civiles immobilières');
  } else {
    const model = String(A.real_estate_model || '').toLowerCase();
    const isParaHotel = ['para_hotel','para_hotellerie','para-hotelier','para-hôtellerie'].includes(model);
    const isMeuble = ['meuble','meublé'].includes(model);
    if (isMeuble || isParaHotel) {
      this.excludeStatus('SCI', 'Location meublée/para-hôtelière = activité commerciale → SCI inadaptée (risque IS)');
    }
    if (['marchand','marchand_de_biens','marchand-de-biens','promotion','lotissement'].includes(model)) {
      this.excludeStatus('SCI', 'Marchand/promotion/lotissement = activité commerciale → préférer SAS/SARL');
    }
  }

  /* ------------------------------------------------------------------
   * 6) Risque pro élevé → éviter responsabilité illimitée
   * ------------------------------------------------------------------ */
  if (isYes(A.high_professional_risk)) {
    this.excludeStatus(
      'SNC',
      'Risque professionnel élevé – responsabilité solidaire/illimitée exclue'
    );
  }

  /* ------------------------------------------------------------------
   * 7) Régime social souhaité
   * ------------------------------------------------------------------ */
  if (A.social_regime === 'assimilated_employee') {
    // N'exclus pas EURL/SARL ; laisse le scoring gérer les cas "gérant minoritaire/égalitaire"
    this.excludeStatuses(
      ['EI', 'MICRO', 'SNC'],
      'Assimilé salarié souhaité – EI/Micro/SNC inadaptés'
    );
  } else if (A.social_regime === 'tns') {
    // Statuts assimilé salarié exclus
    this.excludeStatuses(
      ['SAS', 'SASU', 'SA', 'SELAS', 'SCA'],
      'Régime TNS souhaité – statuts assimilé salarié exclus'
    );
  }

  /* ------------------------------------------------------------------
   * 8) Protection du patrimoine essentielle
   * ------------------------------------------------------------------ */
  if (String(A.patrimony_protection || '').toLowerCase() === 'essential') {
    this.excludeStatuses(['SNC'],
      'Protection patrimoniale essentielle – responsabilité solidaire/illimitée exclue');
  }

  /* ------------------------------------------------------------------
   * 9) Nombre d’associés & statuts uni/pluripersonnels
   *    - Solo : exclure les formes ≥ 2 associés (tolérance SCI si immo + projet familial)
   *    - À plusieurs : exclure les formes unipersonnelles
   *    (règles légales appliquées uniquement si nbAssoc connu)
   * ------------------------------------------------------------------ */
  if (teamSolo) {
    const immoFamily = isImmo && isYes(A.family_project);

    const baseList = ['SARL', 'SAS', 'SA', 'SNC', 'SCA'];
    // Ne PAS exclure la SCI si projet immo familial
    const list = immoFamily ? baseList : [...baseList, 'SCI'];

    this.excludeStatuses(
      list,
      'Un seul associé – statuts pluripersonnels exclus (tolérance SCI si immo + projet familial)'
    );
  } else if (nbAssoc != null && nbAssoc >= 2) {
    this.excludeStatuses(
      ['EI', 'MICRO', 'EURL', 'SASU'],
      'Plusieurs associés – statuts unipersonnels exclus'
    );
  }

  // Bornes légales selon le nombre d’associés connu
  if (nbAssoc != null) {
    if (nbAssoc > 100) this.excludeStatus('SARL', 'SARL limitée à 100 associés');
    if (nbAssoc < 2)   this.excludeStatus('SA',   'SA requiert au moins 2 actionnaires (7 si cotée)');
    if (nbAssoc < 4)   this.excludeStatus('SCA',  'SCA requiert au moins 4 associés (1 commandité + 3 commanditaires)');
  }

  /* ------------------------------------------------------------------
   * 10) Capital social minimum (SA & SCA) + cas cotée/IPO
   *     - SA : 37 000 € (≥ 50 % libéré à la constitution)
   *     - SCA : 37 000 € (ou 225 000 € si appel public à l’épargne)
   * ------------------------------------------------------------------ */
  if (capital != null && capital < 37_000) {
    this.excludeStatuses(['SA','SCA'], 'Capital insuffisant (minimum légal SA/SCA : 37 000 €)');
  }

  const wantsIPO = isYes(this.answers?.public_listing_or_aps);
  if (wantsIPO) {
    if (capital != null && capital < 225_000) {
      this.excludeStatus('SCA', 'SCA avec appel public : capital minimum 225 000 € requis');
    }
    if (nbAssoc != null && nbAssoc < 7) {
      this.excludeStatus('SA', 'SA cotée : au moins 7 actionnaires requis');
    }
  }

  /* ------------------------------------------------------------------
   * 11) Levée de fonds ≥ 1 M€ → éviter SARL / SNC (préférer SAS/SA)
   * ------------------------------------------------------------------ */
  const fundraisingAmount = parseFloat(A.fundraising_amount || '0');
  if ((isYes(A.fundraising) || isYes(A.investors)) && fundraisingAmount >= 1_000_000) {
    this.excludeStatuses(['SARL', 'SNC'], 'Levée de fonds importante (≥ 1 M€) – privilégier SAS/SA');
  }

  /* ------------------------------------------------------------------
   * 12) Activité agricole → proposer statuts agricoles dédiés
   * ------------------------------------------------------------------ */
  if (['agricultural', 'agricole'].includes(String(A.activity_type || A.activity_sector || '').toLowerCase())) {
    this.excludeStatuses(
      ['EI','MICRO','EURL','SASU','SARL','SAS','SA','SNC','SCI','SELARL','SELAS','SCA'],
      'Activité agricole – privilégier EARL, GAEC ou SCEA'
    );
  }

  /* ------------------------------------------------------------------
   * 13) Ordres pros interdisant SAS / SASU (ex. CNB, CNO)
   * ------------------------------------------------------------------ */
  if (['cnb','cno'].includes(orderType)) {
    this.excludeStatuses(['SAS', 'SASU'],
      'Ordre professionnel incompatible avec SAS / SASU (règles ordinales)');
  }
}

    
 /**
 * Alternatives + exclusions — harmonisation des clés (status_id & statusId)
 */
findAlternativeSuggestion(statusId, reason) {
  const reasonCode = this.getReasonCode(reason);
  const block = this.alternativeSuggestions?.[statusId]?.[reasonCode];
  if (block) return block;

  return {
    alternatives: this.getGenericAlternatives(statusId),
    explanation: "Consultez les autres formes juridiques recommandées qui évitent cette contrainte"
  };
}

getReasonCode(reason) {
  const r = String(reason || '');
  const rl = r.toLowerCase();

  if (/ca/i.test(r) && rl.includes('seuil')) return 'ca-depasse-seuil';
  if (rl.includes('ordre professionnel')) return 'ordre-professionnel';
  if (rl.includes('fonds') || rl.includes('levée') || rl.includes('levee')) return 'fundraising';
  if (rl.includes('patrimoine')) return 'protection-patrimoine';
  if (rl.includes('risque')) return 'risque-eleve';

  return rl
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

getGenericAlternatives(statusId) {
  const alternatives = {
    MICRO: ['EI', 'EURL', 'SASU'],
    EI: ['MICRO', 'EURL', 'SASU'],
    EURL: ['SASU', 'SARL', 'EI'],
    SASU: ['SAS', 'EURL', 'EI', 'MICRO'],
    SARL: ['SAS', 'EURL', 'SELARL'],
    SAS: ['SASU', 'SARL', 'SELAS', 'SA'],
    SA: ['SAS', 'SCA'],
    SNC: ['SARL', 'SAS', 'EURL'],
    SCI: ['SARL', 'SAS', 'EURL', 'SASU'],
    SELARL: ['SELAS', 'SARL'],
    SELAS: ['SELARL', 'SAS'],
    SCA: ['SA', 'SAS']
  };
  return alternatives[statusId] || ['EURL', 'SASU'];
}

excludeStatus(statusId, reason) {
  if (!this.filteredStatuses?.[statusId]) return;

  const status = this.filteredStatuses[statusId];
  const suggestion = this.findAlternativeSuggestion(statusId, reason);

  this.incompatibles = this.incompatibles || [];
  this.auditTrail = this.auditTrail || { exclusions: [], weightingRules: [], scores: [] };

  this.incompatibles.push({
    id: statusId,
    name: status.name,
    shortName: status.shortName,
    status,
    reason,
    suggestion,
    compatibilite: 'INCOMPATIBLE'
  });

  delete this.filteredStatuses[statusId];

  // Harmonisation : on stocke les deux clés
  this.auditTrail.exclusions.push({
    status_id: statusId,
    statusId: statusId,
    reason,
    alternative: suggestion?.explanation || null
  });
}

excludeStatuses(statusIds, reason) {
  (statusIds || []).forEach(id => this.excludeStatus(id, reason));
}


/**
 * Calculer les poids à appliquer pour chaque critère basé sur les priorités (MAJ 30/09/2025)
 * - Dédup des priorités
 * - Alias tolérés
 * - Poids relatifs (max)
 * - Normalisation (moyenne = 1) pour comparabilité inter-dossiers
 */
calculatePriorityWeights() {
  const CRITERIA_KEYS = [
    'patrimony_protection',
    'administrative_simplicity',
    'taxation_optimization',
    'social_charges',
    'fundraising_capacity',
    'credibility',
    'governance_flexibility',
    'transmission'
  ];

  // 1) base neutre
  const defaultWeights = Object.fromEntries(CRITERIA_KEYS.map(k => [k, 1]));
  this.priorityWeights = { ...defaultWeights };

  // sécurité trail
  this.auditTrail = this.auditTrail || { exclusions: [], weightingRules: [], scores: {} };

  const raw = Array.isArray(this.answers?.priorities) ? this.answers.priorities : [];
  if (!raw.length) {
    // —— BOOST SECTORIEL IMMOBILIER (ne change pas l'UI des priorités) ——
    if (typeof isImmoPatrimonial === 'function' && isImmoPatrimonial(this.answers)) {
      this.priorityWeights.patrimony_protection      = (this.priorityWeights.patrimony_protection ?? 1) * 1.8;
      this.priorityWeights.transmission              = (this.priorityWeights.transmission ?? 1) * 1.6;
      this.priorityWeights.credibility               = (this.priorityWeights.credibility ?? 1) * 1.25;
      this.priorityWeights.administrative_simplicity = (this.priorityWeights.administrative_simplicity ?? 1) * 1.15;

      // Renormalisation immédiate (moyenne = 1)
      const vals0 = CRITERIA_KEYS.map(k => this.priorityWeights[k] ?? 1);
      const mean0 = vals0.reduce((a,b)=>a+b,0) / vals0.length || 1;
      const f0 = mean0 === 0 ? 1 : (1/mean0);
      CRITERIA_KEYS.forEach(k => { this.priorityWeights[k] = +(this.priorityWeights[k]*f0).toFixed(6); });
      this.auditTrail.weightingRules.push({
        normalization: 'mean_to_1_after_boost',
        before_mean: mean0,
        factor_applied: f0
      });
    }

    console.log('Poids des priorités:', this.priorityWeights);
    return;
  }

  // 2) mapping + alias tolérés
  const priorityMapping = {
    // fisc / charges
    taxation: 'taxation_optimization',
    net_income: 'taxation_optimization',
    social_cost: 'social_charges',
    urssaf: 'social_charges',
    payroll_charges: 'social_charges',

    // protection / gouvernance / transmission
    patrimony_protection: 'patrimony_protection',
    asset_protection: 'patrimony_protection',
    governance_flexibility: 'governance_flexibility',
    bylaws_flexibility: 'governance_flexibility',
    voting_flexibility: 'governance_flexibility',
    transmission: 'transmission',
    estate: 'transmission',
    succession: 'transmission',

    // simplicité / compta
    admin_simplicity: 'administrative_simplicity',
    accounting_cost: 'administrative_simplicity',
    paperwork: 'administrative_simplicity',

    // crédibilité / levée
    credibility: 'credibility',
    image: 'credibility',
    bank_trust: 'credibility',
    fundraising: 'fundraising_capacity',
    investors: 'fundraising_capacity',
    vc_ready: 'fundraising_capacity',

    // couverture sociale
    retirement_insurance: 'social_charges'
  };

  // 3) dédup (on garde le 1er ordre de préférence)
  const seen = new Set();
  const deduped = [];
  for (const p of raw) {
    const key = String(p || '').toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(key);
    }
  }

  // 4) poids par rang (top3 only). Ajuste si moins de 3 priorités.
  const baseRankWeights = [5, 4, 3];
  const rankWeights = baseRankWeights.slice(0, Math.min(3, deduped.length));

  // 5) applique (mode "max" pour éviter l’écrasement en cas d’alias doublons)
  deduped.slice(0, 3).forEach((priorityId, index) => {
    const criteriaKey = priorityMapping[priorityId];
    if (!criteriaKey || !CRITERIA_KEYS.includes(criteriaKey)) return;

    const w = rankWeights[index];
    const current = this.priorityWeights[criteriaKey] ?? 1;
    const next = Math.max(current, w);

    this.priorityWeights[criteriaKey] = next;

    this.auditTrail.weightingRules.push({
      priority: priorityId,
      alias_to: criteriaKey,
      rank: index + 1,
      weight_assigned: w,
      merge_mode: 'max'
    });
  });

  // —— BOOST SECTORIEL IMMOBILIER (ne change pas l'UI des priorités) ——
  if (typeof isImmoPatrimonial === 'function' && isImmoPatrimonial(this.answers)) {
    // facteur multiplicatif doux (sera renormalisé juste après)
    this.priorityWeights.patrimony_protection      = (this.priorityWeights.patrimony_protection ?? 1) * 1.8;
    this.priorityWeights.transmission              = (this.priorityWeights.transmission ?? 1) * 1.6;
    this.priorityWeights.credibility               = (this.priorityWeights.credibility ?? 1) * 1.25;
    this.priorityWeights.administrative_simplicity = (this.priorityWeights.administrative_simplicity ?? 1) * 1.15;
  }

  // 6) normalisation pour que la moyenne des critères reste = 1
  const values = CRITERIA_KEYS.map(k => this.priorityWeights[k] ?? 1);
  const mean = values.reduce((a, b) => a + b, 0) / values.length || 1;
  const factor = mean === 0 ? 1 : (1 / mean);

  CRITERIA_KEYS.forEach(k => {
    this.priorityWeights[k] = +(this.priorityWeights[k] * factor).toFixed(6);
  });

  this.auditTrail.weightingRules.push({
    normalization: 'mean_to_1',
    before_mean: mean,
    factor_applied: factor
  });

  console.log('Poids des priorités (normalisés):', this.priorityWeights);
}


/**
 * Calcul des scores (v2, MAJ 30/09/2025)
 * - Tous les critères passent par calculateCriteriaScore
 * - Clamp 1..5
 * - Sortie 0..100 via ((avg-1)/4)*100
 * - Anti-compensation soft (min < 2 => -5%)
 * - Audit du poids (weight, weight_share, weighted_score, top_contributors)
 */
calculateScores() {
  const CRITERIA = [
    'patrimony_protection',
    'administrative_simplicity',
    'taxation_optimization',
    'social_charges',
    'fundraising_capacity',
    'credibility',
    'governance_flexibility',
    'transmission'
  ];

  const clamp = (x, min = 1, max = 5) =>
    Math.min(max, Math.max(min, Number.isFinite(x) ? x : 3));

  const to100 = (avg1to5) =>
    Math.max(0, Math.min(100, ((avg1to5 - 1) / 4) * 100)); // 1→0 ; 5→100

  this.scores = this.scores || {};
  this.weightedScores = this.weightedScores || {};
  this.auditTrail = this.auditTrail || { exclusions: [], weightingRules: [], scores: {} };
  this.auditTrail.scores = this.auditTrail.scores || {};

  const statuses = Object.keys(this.filteredStatuses || {});

  statuses.forEach(statusId => {
    const status  = this.filteredStatuses[statusId];
    const metrics = status?.key_metrics || {};

    // S'assure de ne pas écraser les logs posés par calculateCriteriaScore
    this.auditTrail.scores[statusId] = this.auditTrail.scores[statusId] || {};

    let totalWeighted = 0;
    let totalWeight   = 0;
    let minCrit       = Infinity;

    // 1) Boucle critères : calcule score & poids, alimente l'audit
    CRITERIA.forEach(criterion => {
      const base = Number.isFinite(metrics[criterion]) ? metrics[criterion] : 3;

      // Toujours passer par calculateCriteriaScore pour capter les règles
      const scored = clamp(
        this.calculateCriteriaScore
          ? this.calculateCriteriaScore(criterion, statusId, metrics)
          : base
      );

      const weight = Number.isFinite(this.priorityWeights?.[criterion])
        ? this.priorityWeights[criterion]
        : 1;

      totalWeighted += scored * weight;
      totalWeight   += weight;
      minCrit        = Math.min(minCrit, scored);

      // Fusion dans l'audit existant (préserve applied_rules, etc.)
      const node = this.auditTrail.scores[statusId][criterion] || {};
      if (node.base_score === undefined) node.base_score = base;
      node.final_score    = scored;
      node.weight         = weight;
      node.weighted_score = +(scored * weight).toFixed(4);
      this.auditTrail.scores[statusId][criterion] = node;
    });

    // 2) Moyenne pondérée 1..5 + conversion 0..100 + anti-compensation
    const avg1to5 = totalWeight > 0 ? (totalWeighted / totalWeight) : 0;
    let score100  = to100(avg1to5);

    let penaltyNote = null;
    if (minCrit < 2) {
      score100    = +(score100 * 0.95).toFixed(2); // -5%
      penaltyNote = 'soft-penalty:min-criterion<2';
    } else {
      score100    = +score100.toFixed(2);
    }

    this.scores[statusId]        = +avg1to5.toFixed(4); // moyenne 1..5
    this.weightedScores[statusId]= score100;            // score 0..100

    // 3) Audit des poids : part relative et top contributeurs
    const contributions = [];
    if (totalWeight > 0) {
      CRITERIA.forEach(c => {
        const node = this.auditTrail.scores[statusId][c];
        const share = (node?.weight || 0) / totalWeight;
        node.weight_share = +share.toFixed(6);
        this.auditTrail.scores[statusId][c] = node;

        if (Number.isFinite(node?.weighted_score)) {
          contributions.push({ criterion: c, weighted: node.weighted_score });
        }
      });
    }

    contributions.sort((a, b) => (b.weighted - a.weighted));
    const topContributors = contributions.slice(0, 3).map(x => x.criterion);

    // 4) Résumé statut
    this.auditTrail.scores[statusId].__summary = {
      avg_1to5: this.scores[statusId],
      score_0to100: this.weightedScores[statusId],
      min_criterion: minCrit,
      penalty: penaltyNote,
      total_weight: +totalWeight.toFixed(6),
      top_contributors: topContributors
    };
  });

  console.log('Scores pondérés (0..100):', this.weightedScores);

  // ─────────────────────────────────────────────────────────────
  // FINALISATION SECTORIELLE — Immobilier patrimonial (nu/bureaux)
  // ─────────────────────────────────────────────────────────────
  (() => {
    const A = this.answers || {};
    if (!(typeof isImmoPatrimonial === 'function' && isImmoPatrimonial(A))) return;

    // 3.1 Planchers minimaux par critère pour la SCI (empêche un affaissement artificiel)
    const floors = {
      patrimony_protection: 4.2,
      transmission: 4.2,
      credibility: 3.2,
      administrative_simplicity: 2.5
    };

    const sciNode = this.auditTrail?.scores?.SCI;
    if (sciNode) {
      Object.entries(floors).forEach(([crit, minFloor]) => {
        const n = sciNode[crit];
        if (!n) return;
        if ((n.final_score ?? n.base_score ?? 0) < minFloor) {
          n.final_score = minFloor;
          n.weighted_score = +(minFloor * (n.weight ?? 1)).toFixed(4);
        }
      });

      // Recalcule la moyenne pondérée SCI → score 0..100
      const recomputeSCI = () => {
        const CRITERIA = [
          'patrimony_protection','administrative_simplicity','taxation_optimization',
          'social_charges','fundraising_capacity','credibility','governance_flexibility','transmission'
        ];
        let tw=0, tws=0, minCrit=Infinity;
        CRITERIA.forEach(c=>{
          const n = sciNode[c];
          if (!n) return;
          const s = Number(n.final_score ?? n.base_score ?? 3);
          const w = Number(n.weight ?? 1);
          tws += s*w; tw += w; minCrit = Math.min(minCrit, s);
        });
        const avg = tw>0 ? (tws/tw) : 0;
        const to100 = (x)=> Math.max(0, Math.min(100, ((x-1)/4)*100));
        let sc = to100(avg);
        if (minCrit < 2) sc = +(sc*0.95).toFixed(2);
        this.scores.SCI = +avg.toFixed(4);
        this.weightedScores.SCI = +sc.toFixed(2);
        sciNode.__summary = sciNode.__summary || {};
        sciNode.__summary.avg_1to5 = this.scores.SCI;
        sciNode.__summary.score_0to100 = this.weightedScores.SCI;
        sciNode.__summary.min_criterion = minCrit;
      };
      recomputeSCI();
    }

    // 3.2 Démagnétisation légère SAS/SARL quand l'objet est patrimonial nu
    const dampen = (id, factor) => {
      if (!this.weightedScores[id]) return;
      this.weightedScores[id] = +(this.weightedScores[id] * factor).toFixed(2);
      if (this.auditTrail?.scores?.[id]?.__summary) {
        this.auditTrail.scores[id].__summary.post_sector_dampen = factor;
        this.auditTrail.scores[id].__summary.score_0to100 = this.weightedScores[id];
      }
    };

    // Dampen piloté par le besoin (si aucune levée/investisseurs)
    const noEquity = A.fundraising !== 'yes' && A.team_structure !== 'investors';
    if (noEquity) {
      dampen('SAS', 0.92);
      dampen('SASU',0.94);
      dampen('SARL',0.94);
    }

    // 3.3 Micro tie-break en faveur de la SCI si à < 4 points du #1
    const entries = Object.entries(this.weightedScores).sort((a,b)=>b[1]-a[1]);
    if (entries.length >= 2) {
      const topId = entries[0][0], sciScore = this.weightedScores.SCI ?? 0, topScore = this.weightedScores[topId] ?? 0;
      const delta = topScore - sciScore;
      if (sciScore > 0 && delta > 0 && delta <= 4) {
        this.weightedScores.SCI = topScore + 0.01;
      }
    }
  })();

  // (optionnel) log après finalisation
  console.log('Scores pondérés après finalisation immo:', this.weightedScores);
}


    
/**
 * Calculer le score pour un critère donné en utilisant les règles applicables (v2)
 * - Base via nullish coalescing (??)
 * - Clamp 1..5
 * - Règles triées par priorité (rule.priority || 100)
 * - Audit détaillé before/after
 * - Cap optionnel de l'impact net par critère (désactivé par défaut)
 */
calculateCriteriaScore(criteria, statusId, metrics) {
  // 1) Base 1..5 et nullish coalescing
  const clamp = (x, min = 1, max = 5) => Math.min(max, Math.max(min, Number.isFinite(x) ? x : 3));
  const baseRaw = metrics?.[criteria];
  const base = clamp(baseRaw ?? 3, 1, 5);

  let score = base;

  // 2) Récupération des règles du critère + tri déterministe
  const rulesForCriterion = (this.rulesByCriteria?.[criteria]
    ?? (Array.isArray(scoringRules) ? scoringRules.filter(r => r.criteria === criteria) : []))
    .slice()
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const appliedRules = [];

  // 3) Cap optionnel de l'impact net par critère (désactivé)
  const ENABLE_NET_CAP = false;    // mets true pour activer
  const NET_CAP_VALUE = 1.5;         // impact net max (+/-) autorisé sur 1..5
  let netDelta = 0;

  for (const rule of rulesForCriterion) {
    if (!rule?.condition || !rule?.apply) continue;
    if (!rule.condition(this.answers)) continue;

    const before = score;

    // Compat : rule.apply peut renvoyer un nombre ou { score, note }
    let out;
    try {
      out = rule.apply(statusId, score, this.answers, metrics);
    } catch (err) {
      console.error('Rule apply error:', rule.id || '(sans id)', err);
      continue; // ignore la règle fautive, on poursuit
    }

    if (out && typeof out === 'object') {
      if (Number.isFinite(out.score)) score = out.score;
      // tu peux aussi logger out.note si tu en fournis
    } else {
      score = out;
    }

    // Clamp step-by-step en 1..5
    score = clamp(score, 1, 5);
    const impact = +(score - before).toFixed(3);
    netDelta += impact;

    appliedRules.push({
      id: rule.id,
      description: rule.description,
      priority: rule.priority ?? 100,
      before,
      after: score,
      impact
    });

    if (ENABLE_NET_CAP && Math.abs(netDelta) >= NET_CAP_VALUE) {
      appliedRules.push({
        id: '__cap__',
        description: `Cap d'impact net atteint (+/-${NET_CAP_VALUE})`,
        priority: Infinity,
        before: score,
        after: score,
        impact: 0
      });
      break;
    }
  }

  // 4) Audit trail riche
  this.auditTrail.scores[statusId] ??= {};
  this.auditTrail.scores[statusId][criteria] ??= {};
  this.auditTrail.scores[statusId][criteria].base_score = base;
  this.auditTrail.scores[statusId][criteria].applied_rules = appliedRules;
  this.auditTrail.scores[statusId][criteria].final_score = score;

  return score; // 1..5
}
/**
 * Explication détaillée et robuste d'une recommandation
 * - Compatible avec les logs d'audit issus de calculateScores ET/OU calculateCriteriaScore
 * - Affiche base -> final, poids, contribution pondérée par critère
 * - Trie les règles par impact décroissant
 * - Récap "boosters" / "freins" global
 * - Indique si le statut a été exclu en amont
 * @param {string} statusId
 * @param {{format?: 'text'|'markdown'}} opts
 * @returns {string}
 */
explainRecommendation(statusId, opts = {}) {
  const format = opts.format || 'text';
  const status = this.filteredStatuses?.[statusId];
  if (!status) return `Aucune explication disponible (statut inconnu: ${statusId}).`;

  const niceName = status.name || statusId;
  const scoresNode = this.auditTrail?.scores?.[statusId] || {};
  const criteriaOrder = [
    'patrimony_protection',
    'administrative_simplicity',
    'taxation_optimization',
    'social_charges',
    'fundraising_capacity',
    'credibility',
    'governance_flexibility',
    'transmission'
  ];
  const labels = {
    patrimony_protection: 'Protection du patrimoine',
    administrative_simplicity: 'Simplicité administrative',
    taxation_optimization: 'Optimisation fiscale',
    social_charges: 'Charges sociales',
    fundraising_capacity: 'Capacité à lever des fonds',
    credibility: 'Crédibilité',
    governance_flexibility: 'Souplesse de gouvernance',
    transmission: 'Transmission'
  };
  const clamp = (x, min = 1, max = 5) => Math.min(max, Math.max(min, Number.isFinite(+x) ? +x : 3));
  const f2 = n => (Number.isFinite(n) ? n.toFixed(2) : String(n));

  // Drapeau exclusion éventuelle (détecte statusId OU status_id)
  const exclusionHit = Array.isArray(this.auditTrail?.exclusions)
    ? this.auditTrail.exclusions.find(e => (e?.statusId || e?.status_id) === statusId)
    : null;

  let totalWeight = 0;
  let sumWeighted = 0;
  const lines = [];
  const allRuleImpacts = [];

  for (const c of criteriaOrder) {
    const node = scoresNode[c] || {};
    // base_score si dispo, sinon métrique brute, sinon raw_score (qui peut déjà être "final"), sinon 3
    const metricBase = status.key_metrics?.[c];
    const base = clamp(node.base_score ?? metricBase ?? node.raw_score ?? 3, 1, 5);
    const finalScore = clamp(node.final_score ?? node.raw_score ?? base, 1, 5);
    const weight = Number.isFinite(node.weight) ? node.weight : (this.priorityWeights?.[c] ?? 1);
    const weighted = Number.isFinite(node.weighted_score) ? node.weighted_score : (finalScore * weight);

    totalWeight += weight;
    sumWeighted += weighted;

    // Règles appliquées
    const rules = Array.isArray(node.applied_rules) ? node.applied_rules.slice() : [];
    // Tri par impact décroissant (impact nul en bas)
    rules.sort((a, b) => Math.abs(b.impact || 0) - Math.abs(a.impact || 0));

    // Collecte globale pour "Top boosters/freins"
    rules.forEach(r => {
      const impact = Number(r.impact || 0);
      if (impact !== 0) {
        allRuleImpacts.push({
          criterion: c,
          label: labels[c] || c,
          id: r.id,
          description: r.description,
          impact
        });
      }
    });

    lines.push({
      c,
      label: labels[c] || c,
      base,
      finalScore,
      delta: +(finalScore - base).toFixed(3),
      weight,
      weighted,
      rules
    });
  }

  // Normalisation cohérente avec calculateScores: (Σ score*poids / Σ poids) * 20
  const normalized100 = totalWeight > 0 ? (sumWeighted / totalWeight) * 20 : 0;
  const normalizedStored = this.weightedScores?.[statusId];
  const final100 = Number.isFinite(normalizedStored)
    ? Math.round(normalizedStored)
    : Math.round(normalized100);

  // Helpers d'affichage
  const h = (s) => (format === 'markdown' ? `**${s}**` : s);
  let out = '';

  out += `${h('Explication')} – ${niceName} (${statusId})\n`;
  if (exclusionHit) {
    out += `⚠️ ${h('Statut exclu')} : ${exclusionHit?.reason || 'Raison non renseignée'}\n`;
  }
  out += `\n${h('Score final')} : ${final100}/100\n`;
  out += `${h('Méthode')} : moyenne pondérée des critères (1..5) normalisée sur 100.\n`;

  // Top boosters / freins
  if (allRuleImpacts.length) {
    const topBoosts = allRuleImpacts
      .filter(r => r.impact > 0)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);
    const topDrags = allRuleImpacts
      .filter(r => r.impact < 0)
      .sort((a, b) => a.impact - b.impact)
      .slice(0, 3);

    if (topBoosts.length) {
      out += `\n${h('Top boosters')} :\n`;
      topBoosts.forEach(r => {
        out += `• ${r.label} – ${r.description} (+${f2(r.impact)})\n`;
      });
    }
    if (topDrags.length) {
      out += `\n${h('Top freins')} :\n`;
      topDrags.forEach(r => {
        out += `• ${r.label} – ${r.description} (${f2(r.impact)})\n`;
      });
    }
  }

  // Détail par critère
  out += `\n${h('Détail par critère')} :\n`;
  lines.forEach(L => {
    out += `\n${h(L.label)} : base ${f2(L.base)}/5 → final ${f2(L.finalScore)}/5`
      + ` | poids ${f2(L.weight)} | contribution ${f2(L.weighted)}\n`;
    if (L.rules.length) {
      out += `  Règles appliquées :\n`;
      L.rules.forEach(r => {
        const imp = r.impact > 0 ? `+${f2(r.impact)}` : f2(r.impact);
        out += `  - ${r.description} (${imp})\n`;
      });
    } else {
      out += `  (Aucune règle appliquée)\n`;
    }
  });

  return out;
}
/**
 * Génère des stratégies contextualisées par statut (MAJ 30/09/2025)
 * - Cohérente avec les IDs de statuts fournis (MICRO, EI, EURL, SASU, SARL, SAS, SA, SNC, SCI, SELARL, SELAS, SCA)
 * - Utilise this.thresholds2025 (micro, TVA, IS réduit)
 */
generateContextualStrategies(statusId) {
  const status = this.filteredStatuses?.[statusId] || window.legalStatuses?.[statusId];
  if (!status) return [];

  const A = this.answers || {};
  const T = this.thresholds2025 || {};
  const priorities = Array.isArray(A.priorities) ? A.priorities : [];
  const isLowTMI  = ['non_taxable','bracket_11'].includes(A.tax_bracket);
  const isHighTMI = ['bracket_41','bracket_45'].includes(A.tax_bracket);

  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : String(n ?? ''));
  const IS_PROFIT_CAP = T?.is_reduced_rate?.profit_cap ?? 42_500;
  const IS_TURNOVER_CAP = T?.is_reduced_rate?.turnover_cap ?? 10_000_000;

  const strategies = [];
  const add = (title, description, icon = 'fa-lightbulb') => {
    // évite les doublons par titre
    if (!strategies.some(s => s.title === title)) strategies.push({ title, description, icon });
  };

  // ───────────────────────────────────────────────────────────────────
  // Stratégies spécifiques par forme juridique
  // ───────────────────────────────────────────────────────────────────

  // MICRO-ENTREPRISE
  if (statusId === 'MICRO') {
    add(
      "Optimisation de la trésorerie",
      "Sous la franchise en base de TVA, vous encaissez la TVA de vos achats sans la reverser : gain de trésorerie si vos clients sont des particuliers.",
      "fa-coins"
    );

    if (isLowTMI) {
      add(
        "Option pour le versement libératoire",
        "Avec une TMI faible, l’option au versement libératoire peut réduire votre impôt (sous conditions de RFR et d’éligibilité).",
        "fa-percent"
      );
    }

    add(
      "Surveillance des seuils micro",
      `Suivez votre CA pour ne pas dépasser les plafonds : ventes/hébergement ${fmt(T?.micro?.bic_sales)} € • services/BIC ${fmt(T?.micro?.bic_service)} € • BNC ${fmt(T?.micro?.bnc)} €. Meublés de tourisme 2025 : ${fmt(T?.micro?.meuble_classe_ca)} € (classé) / ${fmt(T?.micro?.meuble_non_classe_ca)} € (non classé).`,
      "fa-chart-line"
    );

    add(
      "TVA : rester en franchise ou opter",
      `Franchise en base 2025 : ventes ${fmt(T?.tva_franchise_base?.ventes)} € / services ${fmt(T?.tva_franchise_base?.services)} € (tolérances ${fmt(T?.tva_franchise_base?.tolerance_ventes)} € / ${fmt(T?.tva_franchise_base?.tolerance_services)} €). L’option TVA peut améliorer la récup. sur vos achats si vous avez beaucoup d’investissements.`,
      "fa-file-invoice-dollar"
    );
  }

  // EI
  else if (statusId === 'EI') {
    add(
      "Choix micro vs réel",
      "Comparez l’abattement forfaitaire (71 %/50 %/34 %) à vos charges réelles. Si vos charges > abattement, opter pour le réel peut être plus avantageux.",
      "fa-exchange-alt"
    );
    add(
      "Option IS (assimilation EURL) à étudier",
      "Pour lisser l’impôt quand les bénéfices montent, l’option IS (par assimilation EURL) peut être pertinente. Fenêtre d’option : jusqu’à la fin du 3e mois de l’exercice.",
      "fa-balance-scale"
    );
    add(
      "Protection sociale",
      "Renforcez votre couverture avec un PER individuel (ex-Madelin) et une prévoyance (IJ, invalidité, décès).",
      "fa-shield-alt"
    );
  }

  // EURL
  else if (statusId === 'EURL') {
    if (isHighTMI) {
      add(
        "Option IS recommandée (souvent)",
        `Avec une TMI élevée, l’IS peut réduire votre imposition globale. Taux réduit 15 % jusqu’à ${fmt(IS_PROFIT_CAP)} € de bénéfice si CA < ${fmt(IS_TURNOVER_CAP)} €.`,
        "fa-balance-scale"
      );
    } else {
      add(
        "Arbitrage IR vs IS",
        `À l’IR : cotisations sur le bénéfice ; à l’IS : cotisations sur rémunération + dividendes > 10 % (capital libéré + primes + CCA). Simulez selon votre niveau de bénéfice.`,
        "fa-calculator"
      );
    }
    add(
      "Déductibilité des charges",
      "Suivi des charges réelles (véhicule, loyer, matériel, sous-traitance, télécoms…) : effet direct sur le résultat et l’impôt.",
      "fa-receipt"
    );
    add(
      "Éligibilité micro (cas particuliers)",
      "Une EURL à l’IR avec gérant = associé unique peut être éligible au régime micro si l’activité et les seuils s’y prêtent.",
      "fa-info-circle"
    );
  }

  // SASU / SAS
  else if (statusId === 'SASU' || statusId === 'SAS') {
    add(
      "Optimisation salaire / dividendes",
      "Combinez rémunération (protection sociale) et dividendes (PFU par défaut) selon vos besoins de trésorerie et votre TMI.",
      "fa-percent"
    );
    add(
      "Instruments d’intéressement",
      "Prévoyez BSPCE/AGA/BSA et actions de préférence (SAS) pour attirer et fidéliser les talents tout en préparant les tours d’investissement.",
      "fa-gift"
    );
    add(
      "Gouvernance souple",
      "Rédigez des statuts et un pacte d’actionnaires robustes (agrément, préemption, inaliénabilité, bad leaver/good leaver).",
      "fa-users-cog"
    );
    if (A.fundraising === 'yes' || A.investors === 'yes') {
      add(
        "Préparation à la levée",
        "Data room, KPIs, cap table propre, clauses d’investissement (liquidation préférentielle, anti-dilution) : facilitez la négociation.",
        "fa-hand-holding-usd"
      );
    }
    add(
      "Seuils commissaire aux comptes",
      "Anticipez la nomination d’un CAC si 2 des 3 seuils sont dépassés (bilan 5 M€, CA 10 M€, 50 salariés) ou en cas de contrôle/contrôlée.",
      "fa-clipboard-check"
    );
  }

  // SARL
  else if (statusId === 'SARL') {
    add(
      "Statut du gérant",
      "Majoritaire = TNS (cotisations plus faibles, couverture moindre). Minoritaire/égalitaire = assimilé salarié (meilleure couverture, coût supérieur).",
      "fa-user-tie"
    );
    add(
      "Dividendes vs rémunération",
      "À l’IS et gérant majoritaire : dividendes au-delà de 10 % (capital libéré + primes + CCA) soumis à cotisations TNS. Calibrez la politique de distribution.",
      "fa-hand-holding-usd"
    );
    add(
      "SARL de famille (IR)",
      "Si éligible (membres d’une même famille), l’option IR sans limite de durée peut être intéressante.",
      "fa-home"
    );
  }

  // SA
  else if (statusId === 'SA') {
    add(
      "Crédibilité et gouvernance",
      "Forme adaptée aux projets d’envergure (CA/financements importants), conseil d’administration ou directoire/CS, très appréciée des grands comptes.",
      "fa-building"
    );
    add(
      "Rémunération en titres",
      "Mettez en place stock-options, AGA et plans d’actions de performance pour attirer/retenir les dirigeants.",
      "fa-gift"
    );
    add(
      "Pré-cotation",
      "Si une cotation est envisagée, structurez la gouvernance, les procédures et la communication financière dès maintenant.",
      "fa-chart-line"
    );
  }

  // SNC
  else if (statusId === 'SNC') {
    add(
      "Pacte d’associés robuste",
      "Responsabilité illimitée et solidaire : verrouillez les clauses d’agrément, sorties, non-concurrence et répartition des pertes.",
      "fa-file-contract"
    );
    add(
      "Option IS à envisager",
      "En cas de bénéfices élevés, l’option IS peut limiter l’imposition personnelle (IR par défaut en transparence).",
      "fa-balance-scale"
    );
  }

  // SCI
  else if (statusId === 'SCI') {
    add(
      "IR vs IS",
      "À l’IR : revenus fonciers et déficit foncier chez les associés. À l’IS : amortissement de l’immeuble mais plus-values taxées à l’IS à la sortie.",
      "fa-warehouse"
    );
    add(
      "Transmission patrimoniale",
      "Démembrement des parts (nue-propriété/usufruit), donations successives : préparez la transmission familiale.",
      "fa-seedling"
    );
    add(
      "Attention à l’objet civil",
      "Location meublée habituelle/para-hôtellerie et marchand de biens = activité commerciale (risque d’assujettissement IS) : préférez une société commerciale (SARL/SAS).",
      "fa-exclamation-triangle"
    );
  }

  // SELARL
  else if (statusId === 'SELARL') {
    add(
      "Arbitrage TNS",
      "Gérant associé majoritaire = TNS (coût maîtrisé), mais prévoyance à renforcer. Dividendes > 10 % (capital libéré + primes + CCA) assujettis aux cotisations TNS.",
      "fa-user-md"
    );
    add(
      "Épargne salariale",
      "Mettez en place intéressement/PEE/PER collectif pour optimiser la rémunération nette des associés et collaborateurs.",
      "fa-chart-pie"
    );
    add(
      "Conformité ordinale",
      "Statuts et pactes conformes à l’ordre (agrément, quotas de détention par des professionnels).",
      "fa-gavel"
    );
  }

  // SELAS
  else if (statusId === 'SELAS') {
    add(
      "Protection sociale du président",
      "Assimilé salarié (régime général) : meilleure prévoyance, à coût plus élevé qu’en TNS.",
      "fa-heartbeat"
    );
    add(
      "Gouvernance souple avec contraintes ordinales",
      "Profitez de la flexibilité de la SAS (actions de préférence, pacte) tout en respectant les quotas de détention par des professionnels.",
      "fa-users-cog"
    );
    add(
      "Ouverture à des investisseurs (bornée)",
      "Entrée d’investisseurs possible mais minoritaire (règles ordinales) : structurez les droits préférentiels.",
      "fa-handshake"
    );
  }

  // SCA
  else if (statusId === 'SCA') {
    add(
      "Séparation gestion/capitaux",
      "Commandités dirigent (responsabilité illimitée), commanditaires apportent les capitaux : utile pour garder le contrôle tout en levant des fonds.",
      "fa-sitemap"
    );
    add(
      "Transmission en douceur",
      "Cession d’actions de commanditaires facilitée sans perte de contrôle des commandités.",
      "fa-random"
    );
  }

  // ───────────────────────────────────────────────────────────────────
  // Stratégies transverses en fonction des priorités/utilisateur
  // ───────────────────────────────────────────────────────────────────

  if (priorities.includes('patrimony_protection')) {
    if (['SASU','SAS','SARL','EURL','SA','SELAS','SELARL','SCA'].includes(statusId)) {
      add(
        "Protection patrimoniale renforcée",
        "Cumulez la responsabilité limitée avec une RC Pro solide et, pour les dirigeants, une assurance RCMS/D&O.",
        "fa-shield-alt"
      );
    }
  }

  if (A.acre === 'yes') {
    add(
      "Exonération ACRE",
      "Profitez de l’allègement de charges sociales la 1ère année (selon barèmes en vigueur) et anticipez la fin du dispositif.",
      "fa-star"
    );
  }

  if (priorities.includes('taxation_optimization')) {
    if (['SASU','SAS','SARL','EURL','SA','SELAS','SELARL','SCA'].includes(statusId)) {
      add(
        "Taux réduit d’IS (15 %)",
        `Si éligible (CA < ${fmt(IS_TURNOVER_CAP)} €), privilégiez la part de bénéfice jusqu’à ${fmt(IS_PROFIT_CAP)} € au taux réduit.`,
        "fa-piggy-bank"
      );
    }
  }

  if (priorities.includes('fundraising_capacity')) {
    if (['SASU','SAS','SA','SELAS','SCA'].includes(statusId)) {
      add(
        "Prêt-convertible & equity",
        "Pensez BSA Air/OC/ABSA, clause de conversion, actions de préférence et liquidation préférentielle.",
        "fa-seedling"
      );
    } else if (statusId === 'SARL') {
      add(
        "Ouverture du capital encadrée",
        "AGRÉMENT obligatoire pour cessions à des tiers : organisez pacte et calendrier d’augmentations de capital.",
        "fa-user-friends"
      );
    }
  }

  if (priorities.includes('administrative_simplicity')) {
    add(
      "Automatisation back-office",
      "Outil de facturation + synchronisation bancaire + pré-compta = moins de temps administratif, meilleure conformité.",
      "fa-robot"
    );
  }

  if (priorities.includes('transmission')) {
    if (['SCI','SARL','SA','SAS','SELARL','SELAS','SCA','EURL'].includes(statusId)) {
      add(
        "Anticiper la transmission",
        "Pacte Dutreil (si éligible), démembrement, donations échelonnées et clauses de continuation : optimisez fiscalement la transmission.",
        "fa-people-carry"
      );
    }
  }

  if (priorities.includes('social_charges')) {
    if (['SASU','SAS','SA','SELAS'].includes(statusId)) {
      add(
        "Arbitrage net disponible",
        "Simulez finement salaire vs dividendes (PFU/option barème) pour maximiser le net et la protection sociale.",
        "fa-calculator"
      );
    } else if (['SARL','EURL','SELARL'].includes(statusId)) {
      add(
        "Optimisation TNS",
        "Ajustez rémunération, dividendes (seuil 10 %) et versements au PER pour optimiser charges et protection.",
        "fa-sliders-h"
      );
    }
  }

  if (priorities.includes('credibility')) {
    add(
      "Renforcer l’image",
      "Compte pro dédié, assurance adaptée, dépôt des comptes à l’heure et gouvernance claire : signaux positifs pour banques/clients.",
      "fa-handshake"
    );
  }

  if (priorities.includes('governance_flexibility')) {
    if (['SASU','SAS','SELAS'].includes(statusId)) {
      add(
        "Clauses statutaires avancées",
        "Actions de préférence, droits financiers/vote modulés, clauses d’inaliénabilité et mécanismes de sortie (drag/tag).",
        "fa-project-diagram"
      );
    } else {
      add(
        "Pacte d’associés",
        "Même dans des formes plus rigides (SARL/SELARL), un pacte peut compléter utilement les statuts.",
        "fa-file-signature"
      );
    }
  }

  return strategies;
}

/**
 * Génère le HTML des stratégies contextuelles (accessibilité + contraste + responsive)
 * - Palette neutre (slate) + accent (amber/green) pour meilleur contraste
 * - <section> + <ul>/<li> sémantiques, aria-labelledby
 * - Responsive: 1 → 2 → 3 colonnes
 * - Focus visible / hover, ombres douces
 * - join() au lieu de concat en boucle
 */
renderContextualStrategies(statusId) {
  const strategies = this.generateContextualStrategies(statusId);
  if (!Array.isArray(strategies) || strategies.length === 0) return '';

  const status = this.filteredStatuses?.[statusId] || window.legalStatuses?.[statusId];
  if (!status) return '';

  // Petite sécurité XSS si jamais les strings viennent d'une source dynamique
  const esc = (s) => String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');

  const titleId = `strat-title-${statusId.toLowerCase()}`;

  const items = strategies.map((st) => {
    const icon = esc(st.icon || 'fa-lightbulb');
    const title = esc(st.title || '');
    const desc  = esc(st.description || '');

    return `
      <li class="group rounded-lg border border-slate-700/40 bg-slate-800/30 dark:bg-slate-900/30 p-4 shadow-sm
                 hover:bg-slate-800/50 dark:hover:bg-slate-900/50 transition-colors focus-within:ring-2
                 focus-within:ring-amber-400/40">
        <div class="flex items-start gap-3">
          <div class="shrink-0 rounded-full p-2 ring-1 ring-amber-400/30 bg-amber-400/10">
            <i class="fas ${icon} text-amber-400" aria-hidden="true"></i>
          </div>
          <div class="min-w-0">
            <h5 class="font-semibold text-slate-100 mb-1">${title}</h5>
            <p class="text-sm text-slate-300 leading-relaxed">${desc}</p>
          </div>
        </div>
      </li>
    `;
  }).join('');

  return `
    <section class="rounded-xl border border-slate-700/40 bg-slate-800/40 dark:bg-slate-900/40
                    shadow-sm backdrop-blur-sm p-4 md:p-6 mb-6" aria-labelledby="${titleId}">
      <div class="flex items-center gap-2 mb-4">
        <i class="fas fa-lightbulb text-amber-400" aria-hidden="true"></i>
        <h4 id="${titleId}" class="font-semibold text-amber-300 dark:text-amber-400">
          Stratégies optimales pour votre ${esc(status.name)}
        </h4>
      </div>

      <ul role="list" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        ${items}
      </ul>
    </section>
  `;
}

  /**
 * Obtenir les meilleures recommandations (top N) — version robuste
 * - Catégorisation basée sur le score 0..100 non arrondi
 * - Tie-breakers déterministes
 * - Breakdown structurel / objectifs calculé depuis l'audit trail
 */
getTopRecommendations(count = 3) {
  const to100 = (avg1to5) => Math.max(0, Math.min(100, ((avg1to5 - 1) / 4) * 100)); // 1→0 ; 5→100

  // Groupes de critères (tu peux ajuster ces groupes au besoin)
  const GROUPS = {
    structurel: ['patrimony_protection','credibility','governance_flexibility','transmission'],
    objectifs : ['administrative_simplicity','taxation_optimization','social_charges','fundraising_capacity']
  };

  const hasStatuses = this.filteredStatuses && Object.keys(this.filteredStatuses).length > 0;
  if (!hasStatuses) {
    console.error("Aucun statut disponible après application des filtres");
    return [];
  }

  // Construit une liste [statusId, score100, avg1to5, credibilityMetric,...] en sécurisant
  const entries = Object.keys(this.filteredStatuses).map(statusId => {
    const s100 = Number(this.weightedScores?.[statusId]);
    const avg  = Number(this.scores?.[statusId]); // moyenne 1..5
    const cred = Number(this.filteredStatuses[statusId]?.key_metrics?.credibility ?? 0);
    return { statusId, s100, avg, cred };
  }).filter(e => Number.isFinite(e.s100) && Number.isFinite(e.avg));

  if (!entries.length) {
    console.warn("Aucun score pondéré exploitable");
    return [];
  }

  // Tri ↓ par score, puis avg, puis crédibilité, puis nom pour stabilité
  entries.sort((a, b) => {
    if (b.s100 !== a.s100) return b.s100 - a.s100;
    if (b.avg  !== a.avg ) return b.avg  - a.avg;
    if (b.cred !== a.cred) return b.cred - a.cred;
    const na = (this.filteredStatuses[a.statusId]?.name || a.statusId).toString();
    const nb = (this.filteredStatuses[b.statusId]?.name || b.statusId).toString();
    return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
  });

  // Catégorisation
  const categorize = (score) => {
    if (score >= 80) return 'RECOMMANDÉ';
    if (score >= 65) return 'COMPATIBLE';
    if (score < 45)  return 'DÉCONSEILLÉ';
    return 'PEU ADAPTÉ';
  };

  // Calcul d’un sous-score 0..100 pour un groupe de critères, depuis l’audit trail si possible
  const groupScore100 = (statusId, criteriaList) => {
    const node = this.auditTrail?.scores?.[statusId] || {};
    let sw = 0;     // somme (score * poids)
    let w  = 0;     // somme poids

    criteriaList.forEach(c => {
      const cNode = node[c] || {};
      const final = Number.isFinite(cNode.final_score) ? cNode.final_score
                   : Number.isFinite(cNode.raw_score)   ? cNode.raw_score
                   : Number(this.filteredStatuses[statusId]?.key_metrics?.[c] ?? 3);
      const weight = Number.isFinite(cNode.weight) ? cNode.weight
                   : Number(this.priorityWeights?.[c] ?? 1);
      sw += final * weight;
      w  += weight;
    });

    if (w === 0) return null; // pas de pondération exploitable
    const avg = sw / w;       // 1..5
    return Math.round(to100(avg)); // 0..100 arrondi pour lisibilité
  };

  const topN = Math.min(count, entries.length);
  const sliced = entries.slice(0, topN);

  return sliced.map((e, i) => {
    const statusId = e.statusId;
    const status   = this.filteredStatuses[statusId];
    const rawScore = Number(this.weightedScores[statusId]); // non arrondi
    const score    = Math.round(rawScore);

    // Sous-scores calculés (remplace l’approx 60/40)
    const scoreStruct  = groupScore100(statusId, GROUPS.structurel);
    const scoreObject  = groupScore100(statusId, GROUPS.objectifs);

    return {
      rank: i + 1,
      id: statusId,
      name: status.name,
      shortName: status.shortName,
      score,                               // affichage
      score_raw: +rawScore.toFixed(2),     // pour audit/tri précis
      status,
      compatibilite: categorize(rawScore), // catégorisation basée sur le brut
      strengths: this.getStrengths?.(statusId) ?? [],
      weaknesses: this.getWeaknesses?.(statusId) ?? [],
      // remplace l’approximation 0.6/0.4 :
      scoreCriteresStructurels: scoreStruct,
      scoreObjectifs: scoreObject,
      scoreDetails: { pourcentage: score },
      explanation: this.explainRecommendation?.(statusId) ?? ''
    };
  });
}

  /**
 * Obtenir les forces d'un statut juridique pour le profil (MAJ 30/09/2025)
 * - Renvoie un tableau de 1..3 phrases (strings)
 * - Utilise les priorités, le régime social, le CA prévisionnel, la TMI, etc.
 * - Cohérent avec thresholds2025 et les formes disponibles
 */
getStrengths(statusId) {
  const strengths = [];
  const A = this.answers || {};
  const status = (this.filteredStatuses && this.filteredStatuses[statusId]) 
              || (window.legalStatuses && window.legalStatuses[statusId]);
  if (!status) return strengths;

  // ====== Données profil ======
  const priorities = Array.isArray(A.priorities) ? A.priorities.map(p => String(p).toLowerCase()) : [];
  const wantsSimplicity = !!A.administrative_simplicity || priorities.includes('administrative_simplicity') || priorities.includes('accounting_cost') || priorities.includes('paperwork');
  const wantsGovFlex    = !!A.governance_flexibility || priorities.includes('governance_flexibility') || priorities.includes('bylaws_flexibility') || priorities.includes('voting_flexibility');
  const patrimonyEssential = A.patrimony_protection === 'essential' || priorities.includes('patrimony_protection') || priorities.includes('asset_protection');
  const wantsAssimilated   = A.social_regime === 'assimilated_employee';
  const wantsTNS           = A.social_regime === 'tns';
  const fundraising        = A.fundraising === 'yes' || A.investors === 'yes';
  const revenue            = Number.parseFloat(A.projected_revenue || 0);
  const taxBracket         = String(A.tax_bracket || '').toLowerCase(); // 'non_taxable','bracket_11','bracket_30','bracket_41','bracket_45', etc.

  // ====== Seuils (micro + IS réduit) ======
  const isReduced = (this.thresholds2025 && this.thresholds2025.is_reduced_rate) || { profit_cap: 42500, turnover_cap: 10_000_000 };
  const microCeiling = (() => {
    try {
      if (typeof this._getMicroCeilingForAnswers === 'function') {
        return this._getMicroCeilingForAnswers(A);
      }
      // fallback local cohérent avec applySpecificFilters()
      if (A.activity_type === 'immobilier' && A.real_estate_model === 'meuble') {
        return A.furnished_tourism_classed === 'yes'
          ? this.thresholds2025?.micro?.meuble_classe_ca ?? 77700
          : this.thresholds2025?.micro?.meuble_non_classe_ca ?? 15000;
      }
      const nature = String(A.activity_nature || A.activity_category || A.activity_type || '').toLowerCase();
      if (['ventes','hébergement','hebergement','bic_sales'].includes(nature)) return this.thresholds2025?.micro?.bic_sales   ?? 188700;
      if (nature === 'bnc')                                                return this.thresholds2025?.micro?.bnc         ?? 77700;
      return this.thresholds2025?.micro?.bic_service ?? 77700;
    } catch {
      return 77700;
    }
  })();

  const fmt = (n) => Number.isFinite(n) ? n.toLocaleString('fr-FR') : String(n);

  // ====== Règles par statut ======

  // MICRO
  if (statusId === 'MICRO') {
    if (wantsSimplicity) {
      strengths.push("Simplicité administrative maximale (comptabilité ultra-légère, déclaratif en ligne).");
    }
    if (Number.isFinite(revenue) && revenue <= microCeiling) {
      strengths.push(`Adapté à votre CA prévisionnel : sous le plafond micro 2025 (${fmt(microCeiling)} €).`);
    }
    if (['non_taxable','bracket_11'].includes(taxBracket)) {
      strengths.push("Versement libératoire potentiellement avantageux avec TMI faible.");
    }
  }

  // EI
  if (statusId === 'EI') {
    if (wantsSimplicity) strengths.push("Création et gestion très simples (guichet unique, obligations allégées).");
    if (patrimonyEssential) strengths.push("Séparation automatique des patrimoines (depuis 2022) pour sécuriser le personnel.");
    strengths.push("Possibilité d’opter pour l’IS (assimilation EURL) si l’activité monte en puissance.");
  }

  // EURL
  if (statusId === 'EURL') {
    if (patrimonyEssential) strengths.push("Responsabilité limitée aux apports : bonne protection patrimoniale.");
    if (['bracket_41','bracket_45'].includes(taxBracket)) {
      strengths.push(`Option IS intéressante (taux réduit 15 % jusqu’à ${fmt(isReduced.profit_cap)} € si CA < ${fmt(isReduced.turnover_cap)} €).`);
    }
    strengths.push("Évolutive vers SARL à plusieurs associés, crédibilité commerciale solide.");
  }

  // SASU
  if (statusId === 'SASU') {
    if (wantsAssimilated) strengths.push("Président assimilé salarié (régime général : maladie, retraite, prévoyance).");
    if (wantsGovFlex) strengths.push("Grande liberté statutaire et de gouvernance.");
    if (fundraising) strengths.push("Attractive pour investisseurs (BSPCE, actions de préférence, pactes…).");
  }

  // SAS
  if (statusId === 'SAS') {
    if (wantsGovFlex) strengths.push("Gouvernance très flexible (statuts sur-mesure).");
    if (fundraising) strengths.push("Structure plébiscitée pour les levées de fonds et l’entrée d’investisseurs.");
    if (wantsAssimilated) strengths.push("Dirigeants assimilés salariés (protection sociale du régime général).");
  }

  // SARL
  if (statusId === 'SARL') {
    strengths.push("Structure stable et connue, crédible auprès des partenaires.");
    if (wantsTNS) strengths.push("Gérant majoritaire TNS : cotisations généralement plus faibles qu’en assimilé salarié.");
    strengths.push("Régime fiscal adaptable (IS par défaut, IR possible sous conditions / SARL de famille).");
  }

  // SA
  if (statusId === 'SA') {
    strengths.push("Crédibilité institutionnelle élevée (grands comptes, investisseurs).");
    strengths.push("Compatible avec une introduction en bourse et des financements importants.");
    strengths.push("Gouvernance structurée (CA ou directoire/conseil de surveillance).");
  }

  // SNC
  if (statusId === 'SNC') {
    strengths.push("Souplesse statutaire et forte crédibilité bancaire via responsabilité des associés.");
    if (['non_taxable','bracket_11','bracket_30'].includes(taxBracket)) {
      strengths.push("Transparence fiscale à l’IR potentiellement avantageuse si TMI modérée.");
    }
    strengths.push("Répartition des bénéfices très flexible entre associés.");
  }

  // SCI
  if (statusId === 'SCI') {
    strengths.push("Outil patrimonial efficace pour détenir et transmettre de l’immobilier.");
    strengths.push("Statuts souples (agrément, répartition des droits, démembrement des parts).");
    strengths.push("Option IS possible (amortissements) ou IR (déduction des charges réelles chez les associés).");
  }

  // SELARL
  if (statusId === 'SELARL') {
    strengths.push("Adaptée aux professions libérales réglementées (cadre ordinal sécurisé).");
    strengths.push("Responsabilité limitée aux apports ; rémunération technique possible.");
    if (wantsTNS) strengths.push("Gérant majoritaire TNS : niveau de cotisations souvent plus modéré.");
  }

  // SELAS
  if (statusId === 'SELAS') {
    strengths.push("Souplesse de gouvernance (modèle SAS) dans un cadre ordinal.");
    if (wantsAssimilated) strengths.push("Président assimilé salarié : protection sociale du régime général.");
    strengths.push("Facilite l’entrée d’investisseurs sous contraintes de détention professionnelle.");
  }

  // SCA
  if (statusId === 'SCA') {
    strengths.push("Séparation nette pouvoirs/capitaux (commandités dirigent, commanditaires financent).");
    strengths.push("Accès aux capitaux via actions tout en conservant le contrôle opérationnel.");
    strengths.push("Structure pertinente pour groupes familiaux/holdings avec besoin de stabilité de direction.");
  }

  // ====== Ajustements transverses (priorités) ======
  if (patrimonyEssential && ['SASU','SAS','SARL','EURL'].includes(statusId)) {
    strengths.unshift("Responsabilité limitée : bon alignement avec votre priorité de protection patrimoniale.");
  }
  if (wantsGovFlex && ['SASU','SAS','SELAS'].includes(statusId)) {
    strengths.unshift("Très forte souplesse de gouvernance : aligné avec votre priorité de flexibilité.");
  }
  if (fundraising && ['SASU','SAS','SA','SCA'].includes(statusId)) {
    strengths.unshift("Compatible avec une stratégie de levée de fonds.");
  }
  if (statusId === 'MICRO' && wantsSimplicity) {
    strengths.unshift("Ultra simple au quotidien (déclarations micro, pas de bilan).");
  }

  // ====== Complément par avantages génériques si besoin ======
  if (strengths.length < 3 && Array.isArray(status.advantages)) {
    for (const adv of status.advantages) {
      if (strengths.length >= 3) break;
      const already = strengths.some(s => s.toLowerCase().includes(String(adv).toLowerCase()));
      if (!already) strengths.push(adv);
    }
  }

  return strengths.slice(0, 3);
}

/**
 * Obtenir les faiblesses d'un statut juridique pour le profil (MAJ 30/09/2025)
 * - Renvoie un tableau de 1..3 phrases (strings)
 * - Logique profilée (priorités, CA, TMI, régime social, levée de fonds…)
 * - Fallback sur les désavantages génériques du statut si besoin
 */
getWeaknesses(statusId) {
  const weaknesses = [];
  const A = this.answers || {};
  const status = (this.filteredStatuses && this.filteredStatuses[statusId])
              || (window.legalStatuses && window.legalStatuses[statusId]);
  if (!status) return weaknesses;

  // ====== Données profil ======
  const priorities = Array.isArray(A.priorities) ? A.priorities.map(p => String(p).toLowerCase()) : [];
  const wantsSimplicity = !!A.administrative_simplicity || priorities.includes('administrative_simplicity') || priorities.includes('accounting_cost') || priorities.includes('paperwork');
  const wantsGovFlex    = !!A.governance_flexibility || priorities.includes('governance_flexibility') || priorities.includes('bylaws_flexibility') || priorities.includes('voting_flexibility');
  const patrimonyEssential = A.patrimony_protection === 'essential' || priorities.includes('patrimony_protection') || priorities.includes('asset_protection');
  const wantsAssimilated   = A.social_regime === 'assimilated_employee';
  const wantsTNS           = A.social_regime === 'tns';
  const fundraising        = A.fundraising === 'yes' || A.investors === 'yes';
  const revenue            = Number.parseFloat(A.projected_revenue || 0);
  const taxBracket         = String(A.tax_bracket || '').toLowerCase(); // 'non_taxable','bracket_11','bracket_30','bracket_41','bracket_45', etc.

  // ====== Seuils (micro) alignés avec applySpecificFilters() ======
  const microCeiling = (() => {
    try {
      if (typeof this._getMicroCeilingForAnswers === 'function') {
        return this._getMicroCeilingForAnswers(A);
      }
      if (A.activity_type === 'immobilier' && A.real_estate_model === 'meuble') {
        return A.furnished_tourism_classed === 'yes'
          ? this.thresholds2025?.micro?.meuble_classe_ca ?? 77700
          : this.thresholds2025?.micro?.meuble_non_classe_ca ?? 15000;
      }
      const nature = String(A.activity_nature || A.activity_category || A.activity_type || '').toLowerCase();
      if (['ventes','hébergement','hebergement','bic_sales'].includes(nature)) return this.thresholds2025?.micro?.bic_sales   ?? 188700;
      if (nature === 'bnc')                                                return this.thresholds2025?.micro?.bnc         ?? 77700;
      return this.thresholds2025?.micro?.bic_service ?? 77700;
    } catch {
      return 77700;
    }
  })();

  const fmt = (n) => Number.isFinite(n) ? n.toLocaleString('fr-FR') : String(n);

  // ====== Règles par statut ======

  // MICRO
  if (statusId === 'MICRO') {
    if (fundraising) weaknesses.push("Structure peu adaptée aux levées de fonds et à l’entrée d’investisseurs.");
    if (revenue > 0 && revenue >= 0.9 * microCeiling) {
      weaknesses.push(`Risque de dépassement du plafond micro ${fmt(microCeiling)} € à court terme.`);
    }
    if (['bracket_41','bracket_45'].includes(taxBracket)) {
      weaknesses.push("Imposition forfaitaire à l’IR souvent défavorable avec TMI élevée.");
    }
    if (wantsAssimilated) weaknesses.push("Ne permet pas le régime assimilé salarié (protection sociale limitée).");
    if (patrimonyEssential) {
      weaknesses.push("Protection non absolue (exceptions : fraude, dettes fiscales/sociales, caution).");
    }
  }

  // EI
  if (statusId === 'EI') {
    if (fundraising) weaknesses.push("Non adaptée à la levée de fonds ni à l’entrée d’associés.");
    if (wantsAssimilated) weaknesses.push("Régime social TNS (pas d’assimilé salarié par défaut).");
    if (patrimonyEssential) weaknesses.push("Protection patrimoniale perfectible (exceptions légales possibles).");
    if (!wantsSimplicity && (priorities.includes('credibility') || priorities.includes('fundraising'))) {
      weaknesses.push("Crédibilité limitée pour des projets ambitieux.");
    }
  }

  // EURL
  if (statusId === 'EURL') {
    if (wantsGovFlex) weaknesses.push("Moins flexible qu’une SASU pour la gouvernance et l’entrée d’investisseurs.");
    if (fundraising) weaknesses.push("Peu attractive pour les levées de fonds significatives.");
    if (wantsAssimilated) {
      weaknesses.push("Par défaut gérant associé = TNS (assimilé salarié seulement si gérant non associé).");
    }
    weaknesses.push("À l’IS, dividendes > 10 % base (capital libéré + primes + CCA) assujettis aux cotisations TNS.");
  }

  // SASU
  if (statusId === 'SASU') {
    if (wantsTNS) weaknesses.push("Incompatible avec votre préférence TNS (président assimilé salarié).");
    if (revenue > 0 && revenue < 30000) weaknesses.push("Coûts de gestion/compta élevés pour un faible CA.");
    weaknesses.push("Charges sociales élevées sur la rémunération (URSSAF, retraite).");
  }

  // SAS
  if (statusId === 'SAS') {
    if (wantsTNS) weaknesses.push("Ne propose pas de régime TNS pour le dirigeant statutaire.");
    if (wantsSimplicity) weaknesses.push("Obligations juridiques et comptables plus lourdes que les régimes individuels.");
    if (revenue > 0 && revenue < 30000) weaknesses.push("Frais fixes (compta, juridiques) élevés rapportés à un petit CA.");
  }

  // SARL
  if (statusId === 'SARL') {
    if (wantsGovFlex) weaknesses.push("Gouvernance moins souple (règles légales de quorum/majorité, agrément cessions).");
    if (fundraising) weaknesses.push("Moins adaptée aux levées de fonds (agrément, pas d’actions de préférence).");
    weaknesses.push("Si gérant majoritaire : TNS (couverture moins protectrice).");
  }

  // SA
  if (statusId === 'SA') {
    weaknesses.push("Capital minimal 37 000 € et formalisme très lourd (gouvernance, CAC…).");
    if (revenue > 0 && revenue < 300000) weaknesses.push("Sur-dimensionnée pour un projet à faible/moyen CA.");
    if (wantsSimplicity) weaknesses.push("Complexité juridique et coûts de fonctionnement élevés.");
  }

  // SNC
  if (statusId === 'SNC') {
    weaknesses.push("Responsabilité illimitée et solidaire des associés.");
    if (patrimonyEssential) weaknesses.push("Incompatible avec une exigence forte de protection patrimoniale.");
    if (['bracket_41','bracket_45'].includes(taxBracket)) weaknesses.push("Transparence à l’IR potentiellement pénalisante avec TMI élevée.");
    if (fundraising) weaknesses.push("Entrée d’investisseurs difficile (agrément unanime, peu attractive).");
  }

  // SCI
  if (statusId === 'SCI') {
    weaknesses.push("Responsabilité illimitée et proportionnelle des associés.");
    weaknesses.push("Interdiction des activités commerciales (meublé habituel, para-hôtellerie, marchand de biens).");
    if (fundraising) weaknesses.push("Peu adaptée aux levées de fonds externes.");
  }

  // SELARL
  if (statusId === 'SELARL') {
    if (wantsAssimilated) weaknesses.push("Gérant majoritaire = TNS (pas d’assimilé salarié).");
    weaknesses.push("Contraintes ordinales (agréments, détention majoritaire par des professionnels).");
    if (fundraising) weaknesses.push("Ouverture aux investisseurs extérieurs limitée par les règles ordinales.");
  }

  // SELAS
  if (statusId === 'SELAS') {
    if (wantsTNS) weaknesses.push("Président assimilé salarié (pas de TNS).");
    weaknesses.push("Charges sociales élevées sur la rémunération du dirigeant.");
    weaknesses.push("Règles ordinales limitant la part des investisseurs non professionnels.");
  }

  // SCA
  if (statusId === 'SCA') {
    weaknesses.push("Responsabilité illimitée des commandités et gouvernance complexe.");
    weaknesses.push("Capital élevé en cas d’appel public (225 000 €) et coûts de fonctionnement importants.");
    if (wantsSimplicity) weaknesses.push("Complexité juridique importante, forme rare.");
  }

  // ====== Mismatch transverses selon priorités ======
  // Simplicité prioritaire → formes lourdes
  if (wantsSimplicity && ['SA','SAS','SARL','SELARL','SELAS','SCA'].includes(statusId)) {
    weaknesses.unshift("Obligations juridiques et comptables relativement lourdes, peu alignées avec votre priorité de simplicité.");
  }
  // Flexibilité de gouvernance prioritaire → formes rigides
  if (wantsGovFlex && ['SARL','SA','SNC'].includes(statusId)) {
    weaknesses.unshift("Gouvernance moins flexible que les formes par actions, peu alignée avec votre priorité de souplesse.");
  }
  // Levée de fonds prioritaire → formes peu adaptées
  if (fundraising && ['EI','MICRO','SNC','SARL','SCI','SELARL'].includes(statusId)) {
    weaknesses.unshift("Peu adaptée à une stratégie de levée de fonds.");
  }
  // Transmission prioritaire → formes faibles en transmission
  if (priorities.includes('transmission') && ['MICRO','EI','SNC'].includes(statusId)) {
    weaknesses.push("Moins performante pour la transmission du patrimoine ou de l’entreprise.");
  }
  // Mismatch de régime social
  if (wantsAssimilated && ['EI','EURL','SARL'].includes(statusId)) {
    weaknesses.push("Risque de ne pas correspondre à votre préférence pour le régime assimilé salarié.");
  }
  if (wantsTNS && ['SASU','SAS','SA','SELAS','SCA'].includes(statusId)) {
    weaknesses.push("Ne propose pas de régime TNS pour le dirigeant.");
  }

  // ====== Complément par désavantages génériques si besoin ======
  if (weaknesses.length < 3 && Array.isArray(status.disadvantages)) {
    for (const disadv of status.disadvantages) {
      if (weaknesses.length >= 3) break;
      const already = weaknesses.some(w => w.toLowerCase().includes(String(disadv).toLowerCase()));
      if (!already) weaknesses.push(disadv);
    }
  }

  return weaknesses.slice(0, 3);
}
/**
 * Affiche les détails d'un statut juridique (MAJ 30/09/2025)
 * - Sécurisé (escape HTML)
 * - Accessible (role="dialog", aria-*, focus trap, ESC, click dehors)
 * - Robuste (IDs uniques, nettoyage des listeners, restore focus, lock scroll)
 * - Compatible avec recommendation.status existant
 */
showStatusDetails(recommendation) {
  if (!recommendation) return;

  // ─── Helpers ──────────────────────────────────────────────────────
  const escapeHTML = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (m) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));

  const fmt = (n) => Number.isFinite(+n) ? Number(n).toLocaleString('fr-FR') : escapeHTML(n);

  const listHTML = (arr, icon, color) => (arr || [])
    .map(txt => `
      <li class="flex items-start">
        <i class="fas ${icon} ${color} mt-1 mr-2"></i>
        <span>${escapeHTML(txt)}</span>
      </li>
    `).join('');

  const safe = (obj, key, fallback = 'Non spécifié') =>
    escapeHTML(obj?.[key] ?? fallback);

  // ─── Données ──────────────────────────────────────────────────────
  const status = recommendation.status
    || (this.filteredStatuses && this.filteredStatuses[recommendation.id]);
  if (!status) return;

  const explanations = (this.getStatusExplanations
    ? (this.getStatusExplanations(recommendation.id, this.answers) || [])
    : []).slice(0, 5);

  const strengths  = Array.isArray(recommendation.strengths)  ? recommendation.strengths  : (this.getStrengths?.(recommendation.id)  || []);
  const weaknesses = Array.isArray(recommendation.weaknesses) ? recommendation.weaknesses : (this.getWeaknesses?.(recommendation.id) || []);

  // ─── IDs uniques + a11y ──────────────────────────────────────────
  const modalId   = `status-modal-${recommendation.id}-${Date.now()}`;
  const titleId   = `${modalId}-title`;
  const descId    = `${modalId}-desc`;
  const closeId   = `${modalId}-close`;

  // Fermer un éventuel modal déjà ouvert pour éviter les doublons
  document.querySelectorAll(`[data-status-modal="true"]`).forEach(n => n.remove());

  // Lock scroll arrière-plan
  const body = document.body;
  const prevOverflow = body.style.overflow;
  body.style.overflow = 'hidden';

  // Mémoriser l’élément qui avait le focus
  const prevFocus = document.activeElement;

  // ─── Overlay ──────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.setAttribute('data-status-modal', 'true');
  overlay.className = 'fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4';

  // ─── Contenu (ON échappe toutes les interpolations) ───────────────
  overlay.innerHTML = `
    <div class="bg-blue-900 bg-opacity-70 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto outline-none"
         role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${descId}"
         tabindex="-1">
      <!-- Header -->
      <div class="flex items-center mb-6 pb-4 border-b border-gray-700">
        <div class="h-16 w-16 rounded-full bg-blue-800 bg-opacity-50 flex items-center justify-center text-3xl mr-5 shrink-0">
          <i class="fas ${escapeHTML(status.logo || 'fa-building')} text-green-400"></i>
        </div>
        <div class="flex-grow min-w-0">
           <h2 id="${titleId}" class="text-2xl font-bold truncate">
            ${escapeHTML(status.name)} (${escapeHTML(status.shortName)})
          </h2>
          <p id="${descId}" class="text-gray-300 mt-1">
            ${escapeHTML(status.description || '')}
          </p>
        </div>
        <div class="ml-4">
          <span class="px-3 py-1 bg-green-500 text-gray-900 rounded-full font-medium whitespace-nowrap">
            Score&nbsp;: ${fmt(recommendation.score)}/100
          </span>
        </div>
      </div>

      <!-- Pourquoi adapté -->
      <div class="bg-green-900 bg-opacity-20 p-5 rounded-xl border border-green-800 mb-6">
        <h3 class="text-xl font-bold mb-3 text-green-400">
          <i class="fas fa-chart-line mr-2"></i> Pourquoi la ${escapeHTML(status.name)} est adaptée à votre projet
        </h3>
        <div class="mb-4">
          <p class="text-lg mb-3">Basé sur vos réponses, ce statut est particulièrement recommandé car :</p>
          <ul class="space-y-3">
            ${
              explanations.length
                ? explanations.map(item => `
                    <li class="flex items-start">
                      <i class="fas fa-check-circle text-green-400 mt-1 mr-2"></i>
                      <div>
                        <p class="font-medium">${escapeHTML(item.title || '')}</p>
                        <p class="text-gray-300 text-sm">${escapeHTML(item.explanation || '')}</p>
                      </div>
                    </li>
                  `).join('')
                : `<li class="text-gray-300">Analyse personnalisée indisponible pour ce statut.</li>`
            }
          </ul>
        </div>
      </div>

      <!-- Caractéristiques -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
          <h3 class="font-semibold mb-2 flex items-center">
            <i class="fas fa-users mr-2 text-green-400"></i> Structure
          </h3>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Associés :</span>
              <span class="text-right">${safe(status, 'associes')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Capital :</span>
              <span class="text-right">${safe(status, 'capital')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Responsabilité :</span>
              <span class="text-right">${safe(status, 'responsabilite')}</span>
            </li>
          </ul>
        </div>

        <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
          <h3 class="font-semibold mb-2 flex items-center">
            <i class="fas fa-file-invoice-dollar mr-2 text-green-400"></i> Fiscalité
          </h3>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Régime :</span>
              <span class="text-right">${safe(status, 'fiscalite')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Option :</span>
              <span class="text-right">${safe(status, 'fiscaliteOption')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">TVA :</span>
              <span class="text-right">${safe(status, 'regimeTVA')}</span>
            </li>
          </ul>
        </div>

        <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
          <h3 class="font-semibold mb-2 flex items-center">
            <i class="fas fa-user-shield mr-2 text-green-400"></i> Social
          </h3>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Régime :</span>
              <span class="text-right">${safe(status, 'regimeSocial')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Charges :</span>
              <span class="text-right">${safe(status, 'chargesSociales')}</span>
            </li>
            <li class="flex justify-between gap-3">
              <span class="text-gray-400">Protection :</span>
              <span class="text-right">${safe(status, 'protectionPatrimoine')}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Forces / Faiblesses -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div class="bg-green-900 bg-opacity-20 p-4 rounded-lg border border-green-800">
          <h3 class="font-semibold mb-3 flex items-center text-green-400">
            <i class="fas fa-plus-circle mr-2"></i> Points forts
          </h3>
          <ul class="space-y-2">
            ${ strengths.length ? listHTML(strengths, 'fa-check', 'text-green-400') : '<li class="text-gray-300">Aucun point fort spécifique identifié.</li>' }
          </ul>
        </div>

        <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
          <h3 class="font-semibold mb-3 flex items-center text-red-400">
            <i class="fas fa-exclamation-circle mr-2"></i> Points d’attention
          </h3>
          <ul class="space-y-2">
            ${ weaknesses.length ? listHTML(weaknesses, 'fa-times', 'text-red-400') : '<li class="text-gray-300">Aucun point d’attention majeur identifié.</li>' }
          </ul>
        </div>
      </div>

      <!-- Profils adaptés -->
      <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg mb-6">
        <h3 class="font-semibold mb-2 flex items-center text-green-400">
          <i class="fas fa-thumbs-up mr-2"></i> Profils adaptés
        </h3>
        <ul class="space-y-2">
          ${
            Array.isArray(status.suitable_for) && status.suitable_for.length
              ? status.suitable_for.map(item => `
                  <li class="flex items-start">
                    <i class="fas fa-check-circle text-green-400 mt-1 mr-2"></i>
                    <span>${escapeHTML(item)}</span>
                  </li>
                `).join('')
              : '<li class="text-gray-300">Non renseigné.</li>'
          }
        </ul>
      </div>

      <!-- Actions -->
      <div class="flex justify-end mt-6">
        <button id="${closeId}" class="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
          <i class="fas fa-times mr-2"></i> Fermer
        </button>
      </div>
    </div>
  `;

  // ─── Montage DOM ──────────────────────────────────────────────────
  document.body.appendChild(overlay);

  const dialog = overlay.querySelector('[role="dialog"]');
  const btnClose = overlay.querySelector(`#${CSS.escape(closeId)}`);

  // Empêche la fermeture lors d’un clic dans le contenu
  dialog.addEventListener('click', (e) => e.stopPropagation());

  // Fermer sur clic overlay
  const close = () => {
    overlay.remove();
    body.style.overflow = prevOverflow; // restore scroll
    if (prevFocus && typeof prevFocus.focus === 'function') {
      prevFocus.focus();
    }
    // Nettoyage listeners (gc friendly)
    document.removeEventListener('keydown', onKeyDown, true);
  };

  overlay.addEventListener('click', close);
  btnClose.addEventListener('click', close);

  // ESC + focus trap
  const focusables = () => Array.from(dialog.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  ));
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKeyDown, true);

  // Focus initial
  (btnClose || dialog).focus();
}
  /**
 * Ajoute des explications thématiques (patrimoine, régime social, volume, levée, gouvernance, génériques)
 * à la liste d’explications 'out' en fonction de statusId et des réponses A.
 * (Adaptation du bloc que tu avais hors fonction.)
 */
_augmentExplanationsByThemes(statusId, A, out) {
  // --- PROTECTION DU PATRIMOINE ---
  if (A.patrimony_protection === 'essential' &&
      ['SASU','SAS','SARL','EURL','SA','SELARL','SELAS'].includes(statusId)) {
    out.push({
      title: "Protection optimale de votre patrimoine personnel",
      explanation: "Responsabilité limitée aux apports : vos biens privés sont isolés du risque professionnel (sauf fautes de gestion, cautions/garanties personnelles, dettes fiscales/sociales)."
    });
  }
  if (A.patrimony_protection === 'essential' && ['EI','MICRO'].includes(statusId)) {
    out.push({
      title: "Protection partielle (EI/Micro)",
      explanation: "Séparation pro/perso depuis 2022, avec exceptions. Pour une exigence « Essentielle », préférez SASU/EURL/SARL."
    });
    if (A.high_professional_risk === 'yes') {
      out.push({
        title: "Vigilance accrue en activité à risque",
        explanation: "Une structure à responsabilité limitée est recommandée."
      });
    }
  }
  if (A.patrimony_protection === 'essential' && statusId === 'SCA') {
    out.push({
      title: "Protection partielle (SCA)",
      explanation: "Commanditaires protégés, commandités responsables indéfiniment. Privilégiez SAS/SARL si la protection est essentielle."
    });
  }
  if (A.patrimony_protection === 'essential' && ['SNC','SCI'].includes(statusId)) {
    out.push({
      title: "Inadéquation : responsabilité illimitée",
      explanation: "Ce statut n’isole pas votre patrimoine. Orientez-vous vers SASU, EURL ou SARL."
    });
  }

  if (A.patrimony_protection === 'important' &&
      ['SASU','SAS','SARL','EURL','SA','SELARL','SELAS'].includes(statusId)) {
    out.push({
      title: "Responsabilité limitée conforme à vos attentes",
      explanation: "Vos biens personnels sont séparés du risque pro ; vigilances usuelles (cautions, gestion)."
    });
  }
  if (A.patrimony_protection === 'important' && ['EI','MICRO'].includes(statusId)) {
    out.push({
      title: "Protection partielle acceptable si risque maîtrisé",
      explanation: "Séparation pro/perso avec exceptions. Si le risque augmente, passez en responsabilité limitée."
    });
  }
  if (A.patrimony_protection === 'important' && statusId === 'SCA') {
    out.push({
      title: "Protection partielle (SCA)",
      explanation: "Commanditaires OK, commandités exposés. Envisagez SAS/SARL si la protection est réellement importante."
    });
  }
  if (A.patrimony_protection === 'important' && ['SNC','SCI'].includes(statusId)) {
    out.push({
      title: "Protection insuffisante",
      explanation: "Responsabilité illimitée (SNC/SCI) : préférez une forme à responsabilité limitée."
    });
  }

  if (A.patrimony_protection === 'secondary' &&
      ['SASU','SAS','SARL','EURL','SA','SELARL','SELAS'].includes(statusId)) {
    out.push({
      title: "Protection automatique (bonus)",
      explanation: "Même si ce n’est pas prioritaire, la responsabilité limitée reste un atout."
    });
  }
  if (A.patrimony_protection === 'secondary' && ['EI','MICRO'].includes(statusId)) {
    out.push({
      title: "Protection jugée suffisante si activité peu risquée",
      explanation: "La séparation pro/perso (2022) avec exceptions peut convenir si vous acceptez ce risque résiduel."
    });
  }
  if (A.patrimony_protection === 'secondary' && statusId === 'SCA') {
    out.push({
      title: "Compromis acceptable (SCA)",
      explanation: "Commanditaires protégés, commandités exposés : cohérent si le compromis est accepté."
    });
  }
  if (A.patrimony_protection === 'secondary' && ['SNC','SCI'].includes(statusId)) {
    out.push({
      title: "Responsabilité illimitée assumée",
      explanation: "À réserver aux activités à risque opérationnel très limité."
    });
  }

  // --- RÉGIME SOCIAL (préférences) ---
  if (A.social_regime === 'assimilated_employee') {
    if (['SASU','SAS','SA','SELAS'].includes(statusId)) {
      out.push({
        title: "Régime d'assimilé salarié aligné avec votre préférence",
        explanation: "Régime général (maladie, retraite, prévoyance). Pas d’assurance chômage automatique."
      });
    }
    if (statusId === 'SARL' || statusId === 'SELARL') {
      out.push({
        title: "Assimilé salarié possible sous condition de gouvernance",
        explanation: "Gérant minoritaire/égalitaire/tiers = assimilé ; majoritaire = TNS."
      });
    }
    if (statusId === 'EURL') {
      out.push({
        title: "Assimilé salarié possible en EURL (gérant non associé)",
        explanation: "Gérant non associé = assimilé ; associé unique gérant = TNS."
      });
    }
    if (['MICRO','EI'].includes(statusId)) {
      out.push({
        title: "Inadéquation avec votre préférence",
        explanation: "EI/Micro = TNS. Pour de l’assimilé salarié : SASU/SAS/SA/SELAS (ou aménagements en SARL/EURL)."
      });
    }
  }

  if (A.social_regime === 'tns') {
    if (['MICRO','EI'].includes(statusId)) {
      out.push({
        title: "Régime TNS parfaitement aligné",
        explanation: "Cotisations souvent plus faibles, couverture à compléter selon besoin."
      });
    }
    if (statusId === 'EURL') {
      out.push({
        title: "TNS si gérant associé unique",
        explanation: "Non associé = assimilé salarié ; associé unique gérant = TNS."
      });
    }
    if (statusId === 'SARL' || statusId === 'SELARL') {
      out.push({
        title: "TNS sous condition de majorité",
        explanation: "Gérant majoritaire = TNS ; minoritaire/égalitaire/tiers = assimilé."
      });
    }
    if (['SASU','SAS','SA','SELAS'].includes(statusId)) {
      out.push({
        title: "Incompatibilité avec TNS",
        explanation: "Ces formes placent le dirigeant en assimilé salarié."
      });
    }
  }

  if (A.social_regime === 'mixed') {
    if (statusId === 'SARL' || statusId === 'SELARL') {
      out.push({
        title: "Flexibilité par la répartition du capital",
        explanation: "Le régime dépend de la majorité de gérance, ajustable dans le temps."
      });
    }
    if (statusId === 'EURL') {
      out.push({
        title: "Flexibilité via la qualité du gérant",
        explanation: "Changer la qualité du gérant (associé/non associé) fait basculer le régime."
      });
    }
    if (['SASU','SAS','SA','SELAS'].includes(statusId)) {
      out.push({
        title: "Bascule non possible dans la même forme",
        explanation: "Pour du TNS, il faut changer de forme (ex. SASU → EURL/EI) ou réorganiser."
      });
    }
  }
// --- VOLUME D’ACTIVITÉ (SAFE) ---
if (A && A.projected_revenue != null) {
  const r = Number(A.projected_revenue);
  if (Number.isFinite(r) && r >= 0) {
    // Calcul local et sûr du plafond micro (évite ReferenceError)
    const microCeilingLocal = (function () {
      try {
        if (typeof this._getMicroCeilingForAnswers === 'function') {
          const v = this._getMicroCeilingForAnswers(A);
          if (Number.isFinite(v)) return v;
        }
        const T = this.thresholds2025 || {};
        const M = T.micro || {};
        if (A.activity_type === 'immobilier' && A.real_estate_model === 'meuble') {
          return (A.furnished_tourism_classed === 'yes')
            ? (M.meuble_classe_ca != null ? M.meuble_classe_ca : 77700)
            : (M.meuble_non_classe_ca != null ? M.meuble_non_classe_ca : 15000);
        }
        const n = String(A.activity_nature || A.activity_category || A.activity_type || '').toLowerCase();
        if (['ventes','hébergement','hebergement','bic_sales'].indexOf(n) !== -1) return (M.bic_sales != null ? M.bic_sales : 188700);
        if (n === 'bnc') return (M.bnc != null ? M.bnc : 77700);
        return (M.bic_service != null ? M.bic_service : 77700);
      } catch (e) {
        return 77700;
      }
    }).call(this);

    const microCeil = Number(microCeilingLocal);

    // Dépassement du plafond micro
    if (statusId === 'MICRO' && Number.isFinite(microCeil) && r > microCeil) {
      out.push({
        title: "Dépassement des plafonds du régime micro",
        explanation: "Avec " + r.toLocaleString('fr-FR') + " € de CA prévu, envisagez une forme sociétaire (EURL, SASU…)."
      });
    }

    // SASU/SAS : faible CA => frais fixes à surveiller
    if ((statusId === 'SASU' || statusId === 'SAS') && r <= 30000) {
      out.push({
        title: "Frais fixes à surveiller",
        explanation: "Pour un faible CA, charges sociales/compta peuvent peser."
      });
    }
  }
}

  // --- LEVÉE DE FONDS ---
  if (A.fundraising === 'yes') {
    if (statusId === 'SAS') out.push({ title:"Cadre idéal pour accueillir des investisseurs", explanation:"Actions de préférence, BSA/OC, BSPCE, pacte : format préféré des VC/BA." });
    if (statusId === 'SASU') out.push({ title:"SASU → SAS facilement", explanation:"Démarrer seul puis ouvrir le capital sans friction." });
    if (statusId === 'SA') out.push({ title:"Accès élargi aux capitaux (voire bourse)", explanation:"Gouvernance structurée, adaptées aux grosses levées." });
    if (['EI','MICRO','EURL','SARL','SNC','SCI','SELARL','SELAS'].includes(statusId)) {
      out.push({ title:"Moins adapté à une levée externe", explanation:"Agrément strict, objet civil ou absence d’actions : privilégiez SAS/SA si levée." });
    }
  }

  // --- GOUVERNANCE / TEAM STRUCTURE (exemples clés) ---
  if (A.team_structure === 'solo' && ['EI','MICRO','EURL','SASU'].includes(statusId)) {
    out.push({ title:"Gouvernance optimisée pour travailler seul", explanation:"Décisions rapides, formalisme réduit." });
  }
  if (A.team_structure === 'investors' && ['SAS','SASU','SA','SCA'].includes(statusId)) {
    out.push({ title:"Prête à accueillir des investisseurs", explanation:"Émissions d’actions, actions de préférence, gouvernance adaptable." });
  }
}

getStatusExplanations(statusId, answers) {
  const A = answers || this.answers || {};
  const out = [];

  // ── Seuils & helpers sûrs (sans optional chaining) ──────────────
  const t2025 = this.thresholds2025 || {};
  const micro = t2025.micro || {};
  const tvab  = t2025.tva_franchise_base || {};
  const isr   = t2025.is_reduced_rate || {};

  const tmiMap = {
    non_taxable: 'non imposable',
    bracket_11: '11%',
    bracket_30: '30%',
    bracket_41: '41%',
    bracket_45: '45%'
  };
  const tmiLabel = tmiMap[A.tax_bracket] || null;
  const fmtEUR = (n) => Number.isFinite(+n) ? (Number(n).toLocaleString('fr-FR') + ' €') : '';

  // Nature d’activité (pour quelques heuristiques)
  const nature = String(A.activity_nature || A.activity_category || A.activity_type || '').toLowerCase();
  const projectedRevenue = Number(A.projected_revenue || 0);

  // Plafonds micro & TVA (fallbacks 2025 si non configurés)
  const MICRO_SERVICES = (micro.bic_service != null ? micro.bic_service
                        : (micro.bnc != null ? micro.bnc : 77700));
  const MICRO_VENTES   = (micro.bic_sales != null ? micro.bic_sales : 188700);

  const TVA_SERVICES       = (tvab.services != null ? tvab.services : 37500);
  const TVA_VENTES         = (tvab.ventes != null ? tvab.ventes : 85000);
  const TVA_SERVICES_TOL   = (tvab.tolerance_services != null ? tvab.tolerance_services : 41250);
  const TVA_VENTES_TOL     = (tvab.tolerance_ventes != null ? tvab.tolerance_ventes : 93500);

  // Micro threshold (cohérence message “sous plafond”)
  const microThreshold = (function () {
    if (typeof this._getMicroCeilingForAnswers === 'function') {
      return this._getMicroCeilingForAnswers(A);
    }
    if ((A.activity_type === 'immobilier') && (A.real_estate_model === 'meuble')) {
      return (A.furnished_tourism_classed === 'yes')
        ? (micro.meuble_classe_ca)
        : (micro.meuble_non_classe_ca);
    }
    if (['ventes','hébergement','hebergement','bic_sales'].includes(nature)) return MICRO_VENTES;
    if (nature === 'bnc') return (micro.bnc != null ? micro.bnc : MICRO_SERVICES);
    return MICRO_SERVICES; // BIC services par défaut
  }).call(this);

  // Fonctions d’aide
  const isCompany = (id) => ['SAS','SASU','SARL','EURL','SA','SELARL','SELAS','SCA'].includes(id);
  const isSel     = (id) => ['SELARL','SELAS'].includes(id);
  const isSasLike = (id) => ['SAS','SASU','SELAS'].includes(id);

  // Taux réduit d’IS (note contextuelle)
  const isReducedISNote = (function () {
    if (!isCompany(statusId)) return null;
    const cap  = (isr.profit_cap != null ? isr.profit_cap : 42500);
    const capCA = (isr.turnover_cap != null ? isr.turnover_cap : 10000000);
    if (Number.isFinite(projectedRevenue) && projectedRevenue < capCA) {
      return `Éligibilité possible au taux réduit d’IS à 15 % jusqu’à ${fmtEUR(cap)} (CA < ${fmtEUR(capCA)} et autres conditions).`;
    }
    return null;
  })();

  // Franchise en base de TVA
  const tvaFranchiseNote = (function () {
    const seuil = (['ventes','hébergement','hebergement','bic_sales'].includes(nature) ? TVA_VENTES : TVA_SERVICES);
    if (Number.isFinite(projectedRevenue) && projectedRevenue <= seuil) {
      return `Franchise en base de TVA possible (seuils 2025 : ${fmtEUR(TVA_VENTES)} ventes / ${fmtEUR(TVA_SERVICES)} services ; tolérance ${fmtEUR(TVA_VENTES_TOL)} / ${fmtEUR(TVA_SERVICES_TOL)}).`;
    }
    return null;
  })();

  // Priorités utilisateur (sans optional chaining)
  const prios = Array.isArray(A.priorities) ? A.priorities : [];
  const wantsGovFlex  = prios.includes('governance_flexibility') || A.governance_flexibility === 'yes';
  const wantsCred     = prios.includes('credibility') || A.credibility === 'yes';
  const wantsFund     = (A.fundraising === 'yes') || (A.investors === 'yes') || prios.includes('fundraising_capacity');
  const wantsProtect  = (A.patrimony_protection === 'essential') || prios.includes('patrimony_protection');
  const socialPrefAsm = (A.social_regime === 'assimilated_employee');
  const socialPrefTns = (A.social_regime === 'tns');
  const orderYes      = (A.professional_order === 'yes') || (A.regulated_profession === 'yes') || (A.regulated_activity === 'yes');

  // ── Règles communes par statut ───────────────────────────────────

  if (statusId === 'MICRO') {
    out.push({
      title: "Simplicité et charges proportionnelles",
      explanation: "Déclarations et comptabilité ultra-simplifiées ; vos cotisations sont calculées sur le chiffre d’affaires réellement encaissé."
    });
    if (tvaFranchiseNote) out.push({ title: "TVA — franchise en base", explanation: tvaFranchiseNote });
    if (Number.isFinite(projectedRevenue) && Number.isFinite(microThreshold)) {
      out.push({
        title: "Cohérence avec votre niveau de CA",
        explanation: `Votre CA prévisionnel (${fmtEUR(projectedRevenue)}) se situe sous le plafond micro applicable (${fmtEUR(microThreshold)} — 2025).`
      });
    }
    if (tmiLabel && (tmiLabel === 'non imposable' || tmiLabel === '11%')) {
      out.push({
        title: "Micro + faible TMI",
        explanation: `Avec une TMI ${tmiLabel}, l’abattement forfaitaire (71 % ventes/hébergement • 50 % services BIC • 34 % BNC) maintient une base imposable réduite.`
      });
    }
  }
  else if (statusId === 'EI') {
    out.push({ title: "Souplesse de démarrage", explanation: "Création simple, pas de capital, possibilité de rester au micro ou de passer au réel selon l’évolution des charges." });
    out.push({ title: "Séparation pro/perso (2022)", explanation: "Patrimoine professionnel séparé par défaut (hors exceptions légales : fraude, dettes fiscales/sociales, renonciation, caution)." });
    if (tvaFranchiseNote) out.push({ title: "TVA — franchise en base", explanation: tvaFranchiseNote });
    if (tmiLabel) out.push({ title: "Lisibilité fiscale", explanation: `Bénéfices imposés à l’IR (TMI ${tmiLabel}). En cas de montée en charge, l’option IS (assimilation EURL) reste envisageable.` });
  }
  else if (statusId === 'EURL') {
    if (wantsProtect) out.push({ title: "Responsabilité limitée", explanation: "Votre patrimoine personnel est protégé à hauteur des apports." });
    if (socialPrefTns) out.push({ title: "Coût social contenu (TNS)", explanation: "Un gérant associé unique relève du régime TNS, souvent moins coûteux qu’un régime assimilé salarié." });
    if (tmiLabel) out.push({ title: "Arbitrage IR / IS", explanation: `Par défaut à l’IR (TMI ${tmiLabel}) ; option possible pour l’IS (15 % puis 25 %) si votre TMI est élevée ou pour lisser la fiscalité.` });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }
  else if (statusId === 'SASU' || statusId === 'SAS') {
    if (socialPrefAsm) out.push({ title: "Régime social ‘assimilé salarié’", explanation: "Protection du régime général pour le président (hors assurance chômage)." });
    if (wantsGovFlex) out.push({ title: "Gouvernance flexible", explanation: "Statuts personnalisables : organes, droits de vote, clauses d’agrément/inaliénabilité, actions de préférence…" });
    if (wantsFund)   out.push({ title: "Prête pour les investisseurs", explanation: "Ouvre facilement le capital (BSPCE, BSA, actions de préférence, pactes), adaptée aux levées de fonds." });
    if (tmiLabel)    out.push({ title: "Arbitrage salaire/dividendes", explanation: `IS à 15 % / 25 % dissociant fiscalité pro/perso ; avec une TMI ${tmiLabel}, vous pouvez moduler salaire et dividendes.` });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }
  else if (statusId === 'SARL') {
    if (wantsProtect) out.push({ title: "Responsabilité limitée", explanation: "Protection du patrimoine personnel à hauteur des apports." });
    out.push({ title: "Cadre stable & connu", explanation: "Structure robuste et familière des partenaires (banques, assureurs), adaptée aux PME/familiales." });
    if (socialPrefTns) out.push({ title: "Gérant majoritaire = TNS", explanation: "Si vous êtes gérant majoritaire, régime TNS (cotisations souvent plus faibles que le régime salarié)." });
    if (tmiLabel) out.push({ title: "Option IR 5 ans (art. 239 bis AB) ou famille", explanation: `Selon conditions, IR temporaire utile si TMI ${tmiLabel} modérée ; sinon, IS (15 % / 25 %) pour lisser la fiscalité.` });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }
  else if (statusId === 'SA') {
    if (wantsCred) out.push({ title: "Crédibilité institutionnelle", explanation: "Forme très rassurante pour grands comptes, marchés publics et partenaires internationaux." });
    if (wantsFund) out.push({ title: "Ouverture des capitaux", explanation: "Compatible avec des tours de financement significatifs, voire une cotation ultérieure." });
    if (tmiLabel) out.push({ title: "IS par défaut", explanation: `IS 15 % / 25 % ; avec TMI ${tmiLabel}, la fiscalité société limite l’impact sur vos revenus personnels.` });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }
  else if (statusId === 'SNC') {
    out.push({ title: "Transparence fiscale par défaut", explanation: "À l’IR par transparence (option IS possible). Pertinent si TMI faible et forte confiance entre associés." });
    out.push({ title: "Souplesse de répartition", explanation: "Répartition des bénéfices et règles de fonctionnement aménageables statutairement." });
    if (tmiLabel) out.push({ title: "Option IS en cas de TMI élevée", explanation: `Si votre TMI ${tmiLabel} est élevée, l’option IS (15 % / 25 %) peut réduire la charge globale.` });
  }
  else if (statusId === 'SCI') {
    out.push({ title: "Patrimoine immobilier collectif", explanation: "Idéale pour acheter, détenir et gérer un bien à plusieurs avec clauses d’agrément." });
    if ((A.activity_type === 'immobilier') && (!['meuble','para_hotellerie','para-hotelier','para-hôtellerie'].includes(String(A.real_estate_model).toLowerCase()))) {
      out.push({ title: "Location nue & transmission", explanation: "Transparence IR (revenus fonciers) et outils de transmission (démembrement, donations-partage)." });
    } else {
      out.push({ title: "Attention à l’objet civil", explanation: "Meublé habituel/para-hôtelier ou marchand de biens → activité commerciale : envisager SAS/SARL." });
    }
    out.push({ title: "Option IS possible", explanation: "Peut opter pour l’IS (15 % / 25 %) et amortir l’immeuble, utile pour lisser le résultat." });
  }
  else if (statusId === 'SELARL' || statusId === 'SELAS') {
    if (orderYes) out.push({ title: "Adaptée aux professions réglementées", explanation: "Cadre SEL conforme aux exigences ordinales (capital/contrôle par des professionnels, agréments, déontologie)." });
    else          out.push({ title: "Cadre libéral sécurisé", explanation: "Structure dédiée aux professions libérales réglementées (vérifier l’éligibilité auprès de l’ordre)." });
    if (statusId === 'SELAS' && socialPrefAsm) out.push({ title: "Protection sociale du président", explanation: "Régime assimilé salarié (maladie, retraite, prévoyance ; hors chômage)." });
    if (statusId === 'SELARL' && socialPrefTns) out.push({ title: "Coût social contenu (gérant majoritaire TNS)", explanation: "Cotisations souvent plus faibles qu’en régime assimilé salarié (contrepartie : couverture moindre)." });
    if (wantsFund) out.push({ title: "Ouverture encadrée du capital", explanation: "Entrée d’investisseurs possible mais limitée par les quotas/professions autorisées par l’ordre." });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }
  else if (statusId === 'SCA') {
    if (wantsFund) out.push({ title: "Levier de financement + contrôle", explanation: "Sépare direction (commandités) et capitaux (commanditaires) pour lever des fonds en gardant la main." });
    if (wantsCred) out.push({ title: "Crédibilité et stabilité", explanation: "Gouvernance robuste, utile pour groupes familiaux/holdings et stratégies anti-OPA." });
    if (tmiLabel)  out.push({ title: "IS par défaut", explanation: `IS 15 % / 25 % ; avec TMI ${tmiLabel}, la fiscalité société reste décorrélée de vos revenus personnels.` });
    if (isReducedISNote) out.push({ title: "IS à taux réduit (conditions)", explanation: isReducedISNote });
  }

  // ── Bonus contextuels transverses ────────────────────────────────
  if ((['MICRO','SCI','SNC','SA','SCA'].indexOf(statusId) === -1) && tvaFranchiseNote && projectedRevenue > 0) {
    out.push({ title: "TVA — franchise en base (optionnelle)", explanation: tvaFranchiseNote });
  }
  if (wantsProtect && ['SAS','SASU','SARL','EURL','SA','SELARL','SELAS','SCA'].includes(statusId)) {
    out.push({ title: "Protection patrimoniale recherchée", explanation: "Forme à responsabilité limitée : les risques sont cantonnés aux apports (hors fautes/garanties personnelles)." });
  }
  if (wantsGovFlex && isSasLike(statusId)) {
    out.push({ title: "Priorité ‘souplesse de gouvernance’", explanation: "SAS/SELAS permettent un pacte + statuts très modulaires (actions de préférence, vesting, clauses de sortie…)." });
  }
  if (wantsFund && ['SAS','SASU','SA','SCA','SELAS'].includes(statusId)) {
    out.push({ title: "Priorité ‘capacité de levée’", explanation: "Instruments financiers et pratiques de marché bien établis : plus attractif pour VC/BA." });
  }
  if (socialPrefAsm && ['SAS','SASU','SA','SELAS'].includes(statusId)) {
    out.push({ title: "Aligné avec votre préférence sociale", explanation: "Statut du dirigeant ‘assimilé salarié’ (hors assurance chômage) conforme à votre choix." });
  }
  if (socialPrefTns && ['EURL','SARL','SELARL'].includes(statusId)) {
    out.push({ title: "Aligné avec votre préférence TNS", explanation: "Régime TNS possible (ex. gérant majoritaire), souvent moins coûteux en charges." });
  }
  // Vigilance micro proche plafond
  if (statusId === 'MICRO' && Number.isFinite(projectedRevenue) && Number.isFinite(microThreshold)) {
    const ratio = projectedRevenue / microThreshold;
    if (ratio >= 0.7 && ratio < 1) {
      out.push({
        title: "Vigilance ‘proche du plafond’",
        explanation: `Votre CA prévisionnel approche le plafond micro (${fmtEUR(projectedRevenue)} / ${fmtEUR(microThreshold)}). Anticipez un basculement au réel si dépassement.`
      });
    }
  }
  // Alerte SAS/SASU CA faible
  if ((statusId === 'SASU' || statusId === 'SAS') && Number.isFinite(projectedRevenue) && projectedRevenue <= 30000) {
    out.push({ title: "Frais fixes à surveiller", explanation: `Pour ${fmtEUR(projectedRevenue)} de CA, les coûts (compta, charges président) peuvent peser.` });
  }

  // ── Bloc “Volume d’activité” détaillé (intégré) ──────────────────
  if (A.projected_revenue != null) {
    const revenue = Number(A.projected_revenue);
    if (Number.isFinite(revenue) && revenue >= 0) {
      if (statusId === 'MICRO') {
        if (revenue <= MICRO_SERVICES) {
          out.push({
            title: "Compatible avec votre volume d'activité",
            explanation: `Avec un CA prévisionnel de ${revenue.toLocaleString('fr-FR')} €, vous restez sous le plafond de ${fmtEUR(MICRO_SERVICES)} (services/BNC) et profitez de la simplicité du régime micro.`
          });
          if (revenue > TVA_SERVICES) {
            out.push({
              title: "Vigilance TVA (franchise en base)",
              explanation: `Franchise en base : ${fmtEUR(TVA_VENTES)} (ventes) / ${fmtEUR(TVA_SERVICES)} (services) — tolérance ${fmtEUR(TVA_VENTES_TOL)} / ${fmtEUR(TVA_SERVICES_TOL)}.`
            });
          }
        } else if (revenue <= MICRO_VENTES) {
          out.push({
            title: "Sous le plafond micro-BIC (ventes)",
            explanation: `Votre CA prévu (${revenue.toLocaleString('fr-FR')} €) est inférieur à ${fmtEUR(MICRO_VENTES)} (ventes/hébergement).`
          });
          if (revenue > TVA_VENTES) {
            out.push({
              title: "TVA probable malgré le maintien au micro",
              explanation: `Au-delà de ${fmtEUR(TVA_VENTES)} (ventes) — tolérance ${fmtEUR(TVA_VENTES_TOL)} — la franchise en base cesse.`
            });
          }
        } else {
          out.push({
            title: "Dépassement des plafonds du régime micro",
            explanation: `Avec ${revenue.toLocaleString('fr-FR')} € de CA prévu, vous excédez ${fmtEUR(MICRO_SERVICES)} (services/BNC) et ${fmtEUR(MICRO_VENTES)} (ventes). Envisagez EURL/SASU…`
          });
        }
      }
      else if (statusId === 'EI') {
        if (revenue < 100000) {
          out.push({ title: "EI adaptée à un CA modéré", explanation: `Un CA de ${revenue.toLocaleString('fr-FR')} € reste confortable en EI (réel, TVA récupérable si besoin).` });
        } else {
          out.push({ title: "Au-delà, pensez société", explanation: `Avec ${revenue.toLocaleString('fr-FR')} € prévus, passer en société (EURL, SASU…) facilite la séparation pro/perso et l’optimisation.` });
        }
      }
      else if (statusId === 'EURL' || statusId === 'SARL') {
        out.push({ title: "Structure robuste pour votre niveau d’activité", explanation: `La (E)SARL absorbe sans difficulté un CA de ${revenue.toLocaleString('fr-FR')} € et permet d’arbitrer rémunération/dividendes.` });
      }
      else if (statusId === 'SASU' || statusId === 'SAS') {
        if (revenue <= 30000) {
          out.push({ title: "Frais fixes à surveiller", explanation: `Pour ${revenue.toLocaleString('fr-FR')} € de CA, coûts (compta, charges président) à surveiller.` });
        } else if (revenue > 80000) {
          out.push({ title: "Adaptée à un CA élevé et évolutif", explanation: `Avec ${revenue.toLocaleString('fr-FR')} € de CA, la souplesse capitalistique de la SAS(U) facilite la croissance/levées.` });
        } else {
          out.push({ title: "Cadre évolutif pour un CA intermédiaire", explanation: `SAS(U) pertinente pour ${revenue.toLocaleString('fr-FR')} € de CA, en préparant BSPCE, actions de préférence, etc.` });
        }
      }
      else if (statusId === 'SA') {
        if (revenue < 500000) out.push({ title: "Lourdeur possiblement disproportionnée", explanation: `Pour ${revenue.toLocaleString('fr-FR')} € de CA, exigences SA (gouvernance, CAC…) lourdes.` });
        else out.push({ title: "SA : dimension grande entreprise", explanation: `Un CA de ${revenue.toLocaleString('fr-FR')} € justifie la SA et ouvre l’accès aux marchés de capitaux.` });
      }
      else if (statusId === 'SNC') {
        out.push({ title: "Volume d’affaires et responsabilité", explanation: `Avec ${revenue.toLocaleString('fr-FR')} € prévus, la SNC tient la charge mais responsabilité illimitée/solidaire des associés.` });
      }
      else if (statusId === 'SCI') {
        out.push({ title: "SCI : CA lié à l’immobilier", explanation: `Vérifiez que ${revenue.toLocaleString('fr-FR')} € correspondent à des loyers/cessions compatibles avec l’objet civil (sinon requalification).` });
      }
      else if (statusId === 'SELARL' || statusId === 'SELAS') {
        if (revenue < 80000) out.push({ title: "CA modeste : charges à suivre", explanation: `Pour ${revenue.toLocaleString('fr-FR')} € de CA, suivez honoraires/charges/cotisations.` });
        else out.push({ title: "Volume d’activité courant pour une SEL", explanation: `Un CA de ${revenue.toLocaleString('fr-FR')} € est classique ; attention aux plafonds sociaux/seuils CAC.` });
      }
      else if (statusId === 'SCA') {
        out.push({ title: "SCA adaptée aux CA conséquents", explanation: `Avec ${revenue.toLocaleString('fr-FR')} € de CA, la SCA facilite montages financiers (ex. LBO) et investisseurs commanditaires.` });
      }
    }
  }

  // ➜ Compléments depuis le helper thématique
  if (typeof this._augmentExplanationsByThemes === 'function') {
    this._augmentExplanationsByThemes(statusId, A, out);
  }

  // Fallback “génériques” (garantir ≥ 3 points)
  if (out.length < 3) {
    const generic = {
      MICRO: [
        { title: "Simplicité administrative maximale", explanation: "Démarrage rapide, obligations ultra-légères, déclaratif simplifié." },
        { title: "Charges sociales sur le CA encaissé", explanation: "Cotisations uniquement sur le chiffre d’affaires réellement perçu." }
      ],
      EI: [
        { title: "Mise en route simple et modulable", explanation: "Création en ligne, évolution possible vers réel/IS selon croissance." },
        { title: "Séparation pro/perso (2022)", explanation: "Patrimoine pro isolé par défaut (sauf exceptions légales)." }
      ],
      EURL: [
        { title: "Responsabilité limitée + option fiscale", explanation: "Protection des biens personnels et choix IR/IS." },
        { title: "Évolutive vers SARL", explanation: "Crédibilité et arrivée d’associés ultérieure facilitée." }
      ],
      SASU: [
        { title: "Flexibilité statutaire et image ‘corporate’", explanation: "Gouvernance sur mesure, passage fluide en SAS pluripersonnelle." },
        { title: "Rémunération & dividendes modulables", explanation: "Arbitrage salaire/dividendes pour adapter la charge sociale/fiscale." }
      ],
      SARL: [
        { title: "Cadre stable et rassurant", explanation: "Structure connue/robuste pour PME/familial." },
        { title: "Protection + fiscalité adaptable", explanation: "Responsabilité limitée ; IS par défaut, fenêtres IR possibles." }
      ],
      SAS: [
        { title: "Gouvernance sur mesure + investisseurs", explanation: "Statuts flexibles, actions de préférence, BSPCE, pactes…" },
        { title: "Image crédible et dividendes non cotisés", explanation: "Dividendes sans cotisations sociales (hors requalification)." }
      ],
      SA: [
        { title: "Structure institutionnelle", explanation: "Gouvernance robuste et crédible pour grands partenaires." },
        { title: "Accès élargi aux capitaux", explanation: "Adaptée aux projets d’envergure et à une future cotation." }
      ],
      SNC: [
        { title: "Souplesse interne et confiance", explanation: "Répartition des bénéfices flexible, forte implication des associés." },
        { title: "Ancrage bancaire", explanation: "Peut rassurer certains partenaires dans des schémas locaux." }
      ],
      SCI: [
        { title: "Outil patrimonial & transmission", explanation: "Détention/organisation d’un patrimoine et transmissions facilitées." },
        { title: "Souplesse fiscale", explanation: "IR foncier par défaut ou option IS (amortissements) possible." }
      ],
      SELARL: [
        { title: "Cadre libéral sécurisé", explanation: "Conformité ordinale, image crédible pour l’exercice en commun." },
        { title: "Organisation durable", explanation: "Pérennité du cabinet et répartition équilibrée." }
      ],
      SELAS: [
        { title: "Souplesse de la SAS en libéral", explanation: "Gouvernance personnalisable dans le respect des contraintes ordinales." },
        { title: "Ouverture mesurée du capital", explanation: "Association de professionnels et, à la marge, d’investisseurs." }
      ],
      SCA: [
        { title: "Contrôle de la direction", explanation: "Sépare gestion (commandités) et capitaux (commanditaires)." },
        { title: "Accès au marché des capitaux", explanation: "Forme d’actions propice à des levées substantielles." }
      ]
    }[statusId] || [];

    for (let i = 0; i < generic.length && out.length < 3; i++) {
      out.push(generic[i]);
    }
  }

  if (out.length < 3) {
    out.push({
      title: "Structure globalement adaptée à votre profil",
      explanation: "D’après l’analyse multicritères (protection, fiscalité, charges sociales, simplicité, crédibilité, transmission), ce statut présente le meilleur équilibre pour votre situation."
    });
  }

  // Dédup + limitation
  const seen = new Set();
  const deduped = out.filter(item => {
    const sig = (item.title || '') + '::' + (item.explanation || '');
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  return deduped.slice(0, 6);
}


  /**
 * Afficher les détails synthétiques + actions pour chaque recommandation
 */
displayResults(recommendations) {
  console.log("Affichage des résultats:", recommendations);

  const resultsContainer = document.getElementById('results-container');
  const questionContainer = document.getElementById('question-container');

  if (!resultsContainer) {
    console.error('Conteneur de résultats non trouvé');
    return;
  }

  // utilitaire d’échappement (même que showStatusDetails)
  const escapeHTML = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (m) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));

  if (questionContainer) questionContainer.style.display = 'none';
  resultsContainer.style.display = 'block';

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    resultsContainer.innerHTML = `
      <div class="bg-red-900 bg-opacity-20 p-8 rounded-xl text-center mb-8">
        <div class="text-6xl text-red-400 mb-4"><i class="fas fa-exclamation-circle"></i></div>
        <h2 class="text-2xl font-bold mb-4">Aucun statut juridique correspondant</h2>
        <p class="mb-6">Vos critères semblent incompatibles. Essayez d'assouplir certaines exigences et refaites le test.</p>
        <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
          <i class="fas fa-redo mr-2"></i> Refaire le test
        </button>
      </div>
    `;
    resultsContainer.querySelector('#restart-btn')?.addEventListener('click', () => location.reload());
    return;
  }

  let resultsHTML = `
    <div class="results-container">
      <div class="text-center mb-10">
        <h2 class="text-3xl font-bold mb-3">Votre statut juridique recommandé</h2>
        <p class="text-lg text-gray-300">Basé sur vos réponses, voici les formes juridiques les plus adaptées à votre projet</p>
      </div>
      <div class="recommendation-cards">
  `;

  recommendations.forEach((recommendation, index) => {
    const isMainRecommendation = index === 0;

    // Fallback robuste pour le statut (même logique que showStatusDetails)
    const status =
      recommendation.status
      || this.filteredStatuses?.[recommendation.id]
      || window?.legalStatuses?.[recommendation.id]
      || {};

    // Affichage nom + shortName (facultatif)
    const displayName = status.name || recommendation.name || recommendation.id;
    const short = status.shortName ? ` (${status.shortName})` : '';

    const strengths  = Array.isArray(recommendation.strengths)  ? recommendation.strengths  : (this.getStrengths?.(recommendation.id)  || []);
    const weaknesses = Array.isArray(recommendation.weaknesses) ? recommendation.weaknesses : (this.getWeaknesses?.(recommendation.id) || []);

    resultsHTML += `
      <div class="recommendation-card ${isMainRecommendation ? 'main-recommendation' : ''} bg-opacity-60 bg-blue-900 rounded-xl overflow-hidden mb-8 border ${isMainRecommendation ? 'border-green-400' : 'border-gray-700'}">
        <div class="p-6 flex items-center border-b border-gray-700 ${isMainRecommendation ? 'bg-green-900 bg-opacity-30' : ''}">
          <div class="h-16 w-16 rounded-full ${isMainRecommendation ? 'bg-green-800' : 'bg-blue-800'} bg-opacity-30 flex items-center justify-center text-3xl mr-5">
            <i class="fas ${escapeHTML(status.logo || 'fa-building')} ${isMainRecommendation ? 'text-green-400' : 'text-gray-300'}"></i>
          </div>
          <div class="flex-grow min-w-0">
            <div class="flex justify-between items-center gap-3">
              <h3 class="text-2xl font-bold truncate">${escapeHTML(displayName)}${escapeHTML(short)}</h3>
              <div class="score-badge ${isMainRecommendation ? 'bg-green-500 text-gray-900' : 'bg-blue-700 text-white'} px-3 py-1 rounded-full text-sm font-medium shrink-0">
                Score&nbsp;: ${Number(recommendation.score ?? 0)}/100
              </div>
            </div>
            <p class="text-gray-400 mt-1">
              ${isMainRecommendation ? 'Recommandation principale' : `Alternative ${index + 1}`}
            </p>
          </div>
        </div>

        <div class="p-6">
          <p class="mb-5">${escapeHTML(status.description || '')}</p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="font-semibold mb-2 flex items-center text-green-400">
                <i class="fas fa-check-circle mr-2"></i> Points forts
              </h4>
              <ul class="space-y-2">
                ${strengths.map(s => `
                  <li class="flex items-start">
                    <i class="fas fa-plus-circle text-green-400 mt-1 mr-2"></i>
                    <span>${escapeHTML(s)}</span>
                  </li>
                `).join('') || '<li class="text-gray-300">—</li>'}
              </ul>
            </div>

            <div>
              <h4 class="font-semibold mb-2 flex items-center text-red-400">
                <i class="fas fa-exclamation-circle mr-2"></i> Points d'attention
              </h4>
              <ul class="space-y-2">
                ${weaknesses.map(w => `
                  <li class="flex items-start">
                    <i class="fas fa-minus-circle text-red-400 mt-1 mr-2"></i>
                    <span>${escapeHTML(w)}</span>
                  </li>
                `).join('') || '<li class="text-gray-300">—</li>'}
              </ul>
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <button class="details-btn bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg mr-3"
                    data-status-id="${escapeHTML(recommendation.id)}" aria-label="Voir les détails de ${escapeHTML(status.name || recommendation.id)}">
              <i class="fas fa-info-circle mr-2"></i> Plus de détails
            </button>
          </div>
        </div>
      </div>
    `;
  });

  // Stratégies pour la reco principale
  resultsHTML += this.renderContextualStrategies(recommendations[0].id);

  // Incompatibilités
  resultsHTML += this.displayIncompatibilities(this.incompatibles);

  resultsHTML += `
      </div>
      <div class="text-center mt-10">
        <button id="restart-btn" class="bg-blue-700 hover:bg-blue-600 text-white px-6 py-3 rounded-lg">
          <i class="fas fa-redo mr-2"></i> Refaire le test
        </button>
        <button id="compare-btn" class="bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-6 py-3 rounded-lg ml-4">
          <i class="fas fa-balance-scale mr-2"></i> Comparer les statuts
        </button>
      </div>
    </div>
  `;

  resultsContainer.innerHTML = resultsHTML;

  // Délégation d'événements
  resultsContainer.addEventListener('click', (e) => {
    const restart = e.target.closest('#restart-btn');
    if (restart) {
      location.reload();
      return;
    }

    const compare = e.target.closest('#compare-btn');
    if (compare) {
      const tabItems = document.querySelectorAll('.tab-item');
      let opened = false;
      tabItems.forEach((tab) => {
        if (tab.textContent.trim() === 'Comparatif des statuts') {
          tab.click();
          opened = true;
        }
      });
      if (opened) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const details = e.target.closest('.details-btn');
    if (details) {
      const statusId = details.dataset.statusId; // ex: 'SASU', 'MICRO', ...
      const rec = (recommendations || []).find(r => r.id === statusId);
      if (rec) this.showStatusDetails(rec);
    }
  });

  // Événement pour le bouton de téléchargement PDF
  const downloadBtn = document.querySelector('.download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      alert('Fonctionnalité de téléchargement PDF à implémenter');
    });
  }
}

    
  /**
 * Affiche les statuts juridiques incompatibles avec suggestions alternatives
 * @param {Array} incompatibles - [{ id|code|key?, status?, reason, suggestion? }]
 * @returns {string} HTML
 */
displayIncompatibilities(incompatibles) {
  if (!Array.isArray(incompatibles) || incompatibles.length === 0) return '';

  // 1) Regrouper par forme (clé normalisée)
  const byForm = new Map();
  incompatibles.forEach((inc) => {
    const rawKey =
      inc.key || inc.code || inc.id ||
      (inc.status?.code || inc.status?.shortName || inc.status?.id) || '';
    const key = String(rawKey).toUpperCase();

    if (!byForm.has(key)) {
      // On récupère l’objet statut depuis la source sûre si possible
      const statusObj =
        inc.status ||
        this.filteredStatuses?.[key] ||
        null;

      byForm.set(key, {
        key,
        form: statusObj,
        reasons: new Set(),
        suggestions: new Map(), // dé-dupe par (targetId|explanation)
      });
    }

    const bucket = byForm.get(key);

    // Raison
    if (inc.reason) bucket.reasons.add(inc.reason);

    // Suggestion
    if (inc.suggestion) {
      const tgt = inc.suggestion.targetId || inc.suggestion.targetKey || '';
      const exp = inc.suggestion.explanation || '';
      const dedupeKey = `${tgt}::${exp}`;
      if (!bucket.suggestions.has(dedupeKey)) {
        bucket.suggestions.set(dedupeKey, {
          targetId: tgt || null,
          explanation: exp,
        });
      }
    }
  });

  // 2) Tri facultatif : les cartes avec le plus de raisons d’abord
  const items = Array.from(byForm.values()).sort(
    (a, b) => b.reasons.size - a.reasons.size
  );

  // 3) Génération HTML
  let html = `
    <section class="mt-8 mb-6" aria-labelledby="incompat-title">
      <h3 id="incompat-title" class="text-xl font-bold text-red-400 mb-4 flex items-center">
        <i class="fas fa-exclamation-triangle mr-2" aria-hidden="true"></i>
        Formes juridiques incompatibles avec votre profil
      </h3>

      <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
        <p class="mb-4">Les structures suivantes présentent des incompatibilités avec vos critères :</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
  `;

  items.forEach((item) => {
    const name =
      item.form?.name || item.form?.shortName || item.key || 'Statut';
    const shortName = item.form?.shortName ? ` (${item.form.shortName})` : '';
    const reasons = Array.from(item.reasons);
    const suggestions = Array.from(item.suggestions.values());

    html += `
      <article role="listitem"
               class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800"
               data-status-key="${item.key}">
        <h4 class="font-semibold text-red-400 mb-2">${name}${shortName}</h4>

        <ul class="text-sm space-y-1" aria-label="Raisons d'incompatibilité">
    `;

    // si >4 raisons, on affiche 4 + le reste dans <details>
    const maxInline = 4;
    const head = reasons.slice(0, maxInline);
    const tail = reasons.slice(maxInline);

    head.forEach((reason) => {
      html += `
        <li class="flex items-start">
          <i class="fas fa-times text-red-400 mr-2 mt-1" aria-hidden="true"></i>
          <span>${reason}</span>
        </li>`;
    });

    if (tail.length > 0) {
      html += `
        <li>
          <details class="mt-1">
            <summary class="cursor-pointer text-gray-300 hover:text-gray-100">
              Voir ${tail.length} raison(s) supplémentaire(s)
            </summary>
            <ul class="mt-2 space-y-1">
              ${tail
                .map(
                  (r) => `
                <li class="flex items-start">
                  <i class="fas fa-times text-red-400 mr-2 mt-1" aria-hidden="true"></i>
                  <span>${r}</span>
                </li>`
                )
                .join('')}
            </ul>
          </details>
        </li>`;
    }

    // Suggestions
    if (suggestions.length > 0) {
      html += `<li class="mt-3 pt-2 border-t border-red-800"></li>`;
      suggestions.forEach((s) => {
        const hasTarget = !!s.targetId;
        html += `
          <li class="mt-2 flex items-start">
            <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-1" aria-hidden="true"></i>
            <span>
              <strong>Alternative :</strong> ${s.explanation}
              ${
                hasTarget
                  ? `<button class="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-xs"
                              type="button"
                              data-target-id="${String(s.targetId).toUpperCase()}"
                              title="Voir les détails de l’alternative">
                        Voir les détails
                     </button>`
                  : ''
              }
            </span>
          </li>
        `;
      });
    }

    html += `
        </ul>
      </article>
    `;
  });

  html += `
        </div>
      </div>
    </section>
  `;

  return html;
}
}

/**
 * Crée et retourne un moteur de recommandation à la demande (lazy loading)
 * @returns {Promise<RecommendationEngine>} - Une promesse résolvant vers un instance du moteur
 */
window.loadRecommendationEngine = async function() {
    return new Promise((resolve, reject) => {
        try {
            // Attendre que les statuts juridiques soient chargés si nécessaire
            if (window.legalStatuses) {
                const engine = new RecommendationEngine();
                resolve(engine);
            } else {
                // Attendre l'événement de chargement
                const handler = () => {
                    try {
                        const engine = new RecommendationEngine();
                        resolve(engine);
                    } catch (e) {
                        reject(e);
                    } finally {
                        document.removeEventListener('legalStatusesLoaded', handler);
                    }
                };
                
                document.addEventListener('legalStatusesLoaded', handler);
                
                // Timeout de sécurité
                setTimeout(() => {
                    if (!window.legalStatuses) {
                        document.removeEventListener('legalStatusesLoaded', handler);
                        reject(new Error("Timeout: Les données juridiques n'ont pas pu être chargées dans le délai imparti"));
                    }
                }, 10000);
            }
        } catch (e) {
            reject(e);
        }
    });
};

// Définir l'instance directement disponible
try {
    window.recommendationEngine = new RecommendationEngine();
    
    // Notifier que l'engin est prêt
    document.dispatchEvent(new CustomEvent('recommendationEngineReady'));
    console.log("Objet recommendationEngine créé et disponible globalement");
} catch (e) {
    console.error("Impossible de créer recommendationEngine directement:", e);
    console.log("Vous pouvez utiliser window.loadRecommendationEngine() à la place");
}

// Notification de fin de chargement du script
console.log("Chargement du recommendation-engine.js terminé");
