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
        categorie: 'Commerciale/Civile',
        associes: '1',
        capital: 'Aucun',
        responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
        fiscalite: 'IR',
        fiscaliteOption: 'Versement libératoire (optionnel)',
        regimeSocial: 'TNS',
        protectionPatrimoine: 'Oui (depuis 2022)',
        chargesSociales: 'Simplifiées, calculées sur le CA',
        fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
        regimeTVA: 'Franchise en base (TVA uniquement si dépassement seuils)',
        publicationComptes: 'Non',
        formalites: 'Très simplifiées',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Non',
        entreeAssocies: 'Non',
        profilOptimal: 'Entrepreneur solo',
        advantages: [
            "Création très simple et rapide",
            "Comptabilité ultra-simplifiée (livre des recettes)",
            "Charges calculées uniquement sur le CA réalisé",
            "Système déclaratif simplifié en ligne",
            "Exonération de TVA jusqu'aux seuils (2025)",
            "Régime fiscal forfaitaire avantageux si faibles charges",
            "Option possible pour le versement libératoire de l'IR (sous conditions de RFR)"
        ],
        disadvantages: [
            "Plafonds de chiffre d'affaires limités (BIC vente: 188 700€, BIC service/BNC: 77 700€ en 2025)",
            "Responsabilité personnelle illimitée",
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
        casConseille: 'Début d\\\'activité, test',
        casDeconseille: 'Développement ambitieux',
        transmission: 'Non',
        plafondCA: '188 700 € (vente/hébergement) ou 77 700 € (services/libérales)',
        key_metrics: {
            patrimony_protection: 3,
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
        categorie: 'Commerciale/Civile',
        associes: '1',
        capital: 'Aucun',
        responsabilite: 'Limitée au patrimoine professionnel (réforme 2022)',
        fiscalite: 'IR',
        fiscaliteOption: 'IS (option possible dans les 3 mois de l’exercice ; irrévocable 5 ans)',
        regimeSocial: 'TNS',
        protectionPatrimoine: 'Oui (depuis 2022)',
        chargesSociales: 'Sur bénéfices',
        fiscal: 'Non applicable (pas de distribution, IR sur bénéfices)',
        regimeTVA: 'Oui',
        publicationComptes: 'Non',
        formalites: 'Très simplifiées',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Non',
        entreeAssocies: 'Non',
        profilOptimal: 'Entrepreneur solo',
        advantages: [
               "Création immédiate, gratuite et 100 % en ligne",
      "Aucun capital requis",
      "Séparation automatique des patrimoines (réforme 2022)",
      "Option possible pour l’IS si montée en puissance",
      "Choix entre micro-BIC/BNC ou réel (souplesse comptable)",
      "Franchise en base de TVA accessible sous conditions",
      "Formalités et obligations de publicité très légères"
        ],
        disadvantages: [
  "Protection du patrimoine partielle : levée en cas de fraude, dettes fiscales/sociales ou renonciation",
      "Impossible de faire entrer des associés ou de lever des fonds",
      "Crédibilité parfois limitée auprès des grandes banques ou investisseurs",
      "Couverture sociale TNS moins protectrice si revenus faibles",
      "Comptabilité complète obligatoire dès passage au réel"
        ],
        suitable_for: [
       "Artisans, commerçants ou freelances travaillant seuls",
      "Test de concept avant passage en société",
      "Activité indépendante secondaire ou complémentaire"
        ],
        casConseille: 'Activité individuelle stable et peu capitalistique',
        casDeconseille: 'Projets nécessitant investisseurs ou associés',
        transmission: 'Non',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 3,
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
        categorie: 'Commerciale',
        associes: '1',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IR par défaut (si associé personne physique) ou IS',
        fiscaliteOption: 'Oui',
        regimeSocial: 'TNS (gérant associé unique) ; assimilé salarié uniquement si le gérant n’est pas associé"',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération TNS ; sur dividendes pour la part dépassant 10 % du capital + primes + compte courant associé',
        fiscal: 'Dividendes possibles',
        regimeTVA: 'Assujettie ; franchise en base possible sous les seuils micro',
        publicationComptes: 'Oui',
        formalites: 'Modérées',
        activite: 'Toutes, hors activités réglementées spécifiques',
        leveeFonds: 'Limité (structure peu attractive pour VC)',
        entreeAssocies: 'Possible (passage en SARL multi-associés)',
        profilOptimal: 'Entrepreneur solo cherchant séparation patrimoine',
        advantages: [
      "Responsabilité limitée aux apports",
      "Image de société commerciale crédible",
      "Choix de l'imposition (IR ou IS sous conditions)",
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
        categorie: 'Commerciale',
        associes: '1',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS',
        fiscaliteOption: 'IR optionnelle pour 5 exercices (conditions : société < 5 ans, < 50 salariés, CA < 10 M€)',
        regimeSocial: 'Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération ; les dividendes sont exempts de cotisations sauf part > 10 % du capital + primes + compte courant associé',
        fiscal: 'Dividendes possibles',
        regimeTVA: 'Assujettie ; franchise en base possible sous les seuils micro',
        publicationComptes: 'Oui',
        formalites: 'Modérées',
        activite: 'Toutes',
        leveeFonds: 'Oui (instruments financiers, capital variable, pactes…)',
        entreeAssocies: 'Facile (simple cession ou augmentation de capital)',
        profilOptimal: 'Entrepreneur solo souhaitant régime salarié et levée de fonds',
        advantages: [
     "Grande souplesse statutaire (organes et pouvoirs librement fixés)",
      "Responsabilité limitée aux apports",
      "Régime social du salarié (maladie, retraite, prévoyance)",
      "Facilité d’accueil d’investisseurs (BSPCE, AGA, BSA…) et levée de fonds",
      "Pas de capital minimum légal",
      "Image professionnelle et crédible"
        ],
        disadvantages: [
      "Coûts de création et de gestion (expert-comptable, dépôt des comptes)",
      "Imposition IS par défaut (option IR limitée à 5 ans)",
      "Charges sociales élevées (URSSAF + retraite cadre) sur la rémunération",
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
        categorie: 'Commerciale',
        associes: '2-100',
        capital: '1€ minimum (20 % libérés à la constitution ; solde dans les 5 ans)',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS par défaut',
        fiscaliteOption: 'IR possible pendant 5 exercices (conditions : < 50 salariés, CA < 10 M€, société < 5 ans, ≥ 50 % du capital détenu par personnes physiques) – option à exercer dans les 3 premiers mois et irrévocable pendant 5 ans',
        regimeSocial: 'TNS (gérant majoritaire), Assimilé salarié (gérant minoritaire/égalitaire)',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération du gérant (TNS ou assimilé). Pour un gérant TNS : cotisations également sur la part de dividendes dépassant 10 % du capital libéré + primes d’émission + compte courant associé',
        fiscal: 'Oui, selon IS/IR',
        regimeTVA: 'Assujettie (franchise en base possible sous les seuils micro-entreprise)',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Limité (pas d’appel public à l’épargne, agrément obligatoire)',
        entreeAssocies: 'Modérée (cession de parts soumise à agrément des associés)',
        profilOptimal: 'PME ou société familiale recherchant stabilité',
        advantages: [
     "Responsabilité limitée aux apports",
      "Capital social libre à partir de 1 €",
      "Structure connue et crédible auprès des partenaires",
      "Stabilité de la gouvernance (gérance, assemblée annuelle)",
      "Régime fiscal adaptable (IS par défaut ou IR sous conditions)",
      "Bonne protection patrimoniale pour les associés"
        ],
        disadvantages: [
      "Formalisme juridique important (assemblées, rapports)",
      "Frais de constitution et de fonctionnement supérieurs à une EI",
      "Couverture sociale TNS moins protectrice (bien que cotisations plus faibles)",
      "Moins de souplesse que la SAS pour l’entrée d’investisseurs",
      "Cession de parts sociales encadrée, procédure d’agrément obligatoire",
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
        categorie: 'Commerciale',
        associes: '2+',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS (IR option 5 ans)',
        fiscaliteOption: 'Oui',
        regimeSocial: 'Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui, selon IS/IR',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Oui',
        entreeAssocies: 'Oui',
        profilOptimal: 'Start-up, investisseurs',
        advantages: [
            "Grande liberté statutaire",
            "Responsabilité limitée aux apports",
            "Facilité pour faire entrer ou sortir des associés",
            "Régime social du dirigeant assimilé salarié",
            "Adaptée pour les levées de fonds",
            "Gouvernance personnalisable",
            "Instruments financiers variés (actions de préférence, BSPCE, BSA...)"
        ],
        disadvantages: [
            "Coûts de création et de fonctionnement élevés",
            "Commissaire aux comptes obligatoire dans certains cas",
            "Imposition obligatoire à l'IS",
            "Structure complexe pour de petits projets",
            "Charges sociales élevées pour le président",
            "Coûts administratifs récurrents"
        ],
        suitable_for: [
            "Projets ambitieux avec plusieurs associés",
            "Startups et entreprises innovantes",
            "Activités nécessitant des levées de fonds",
            "Sociétés avec gouvernance complexe",
            "Groupes de sociétés"
        ],
        casConseille: 'Start-up, levée de fonds',
        casDeconseille: 'Professions réglementées',
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
        description: "Société par actions destinée aux projets de grande envergure avec un capital minimal de 37 000€.",
        logo: "fa-building",
        color: "#E91E63",
        categorie: 'Commerciale',
        associes: '2 (non cotée), 7 (cotée)',
        capital: '37 000 € (50% libéré à la constitution, solde dans les 5 ans)',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS',
        fiscaliteOption: 'Non',
        regimeSocial: 'Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Complexes',
        activite: 'Grandes entreprises',
        leveeFonds: 'Oui',
        entreeAssocies: 'Oui',
        profilOptimal: 'Grands groupes, cotation',
        advantages: [
            "Crédibilité maximale auprès des partenaires",
            "Adaptée pour l'entrée en bourse",
            "Gouvernance structurée (CA ou directoire/CS)",
            "Anonymat des actionnaires possible",
            "Facilité pour céder des actions",
            "Image institutionnelle forte"
        ],
        disadvantages: [
            "Capital minimal de 37 000€ (50% libérés min.)",
            "Formalisme juridique très lourd",
            "Coûts de création et fonctionnement très élevés",
            "Commissaire aux comptes obligatoire",
            "Processus décisionnel complexe",
            "Contraintes de reporting importantes"
        ],
        suitable_for: [
            "Grandes entreprises",
            "Projets visant une introduction en bourse",
            "Structures nécessitant une forte crédibilité",
            "Entreprises avec nombreux actionnaires",
            "Groupes internationaux"
        ],
        casConseille: 'Grande entreprise, cotation',
        casDeconseille: 'Petite structure',
        transmission: 'Oui',
        plafondCA: 'Aucun plafond',
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
        fiscalite: 'IR (IS option)',
        fiscaliteOption: 'Oui',
        regimeSocial: 'TNS',
        protectionPatrimoine: 'Non',
        chargesSociales: 'Sur bénéfices',
        fiscal: 'Oui, selon IS/IR',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Non',
        entreeAssocies: 'Difficile',
        profilOptimal: 'Confiance entre associés',
        advantages: [
            "Pas de capital minimum",
            "Flexibilité dans la rédaction des statuts",
            "Répartition libre des bénéfices",
            "Crédibilité auprès des banques",
            "Régime fiscal transparent",
            "Confidentialité des comptes possible"
        ],
        disadvantages: [
            "Responsabilité illimitée et solidaire des associés",
            "Tous les associés sont considérés comme commerçants",
            "Imposition transparente à l'IR",
            "Cession de parts soumise à l'accord des associés",
            "Protection sociale limitée",
            "Difficultés en cas de mésentente entre associés"
        ],
        suitable_for: [
            "Professions libérales non réglementées",
            "Entreprises familiales",
            "Associés ayant une grande confiance mutuelle",
            "Structures nécessitant confidentialité",
            "Activités commerciales entre professionnels"
        ],
        casConseille: 'Activité familiale, confiance',
        casDeconseille: 'Projet risqué',
        transmission: 'Oui',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 1,
            administrative_simplicity: 3,
            taxation_optimization: 4,
            social_charges: 3,
            fundraising_capacity: 2,
            credibility: 3,
            governance_flexibility: 4,
            transmission: 2
        }
    },
    "SCI": {
        id: 'sci',
        name: "Société Civile Immobilière",
        shortName: "SCI",
        description: "Société civile destinée exclusivement à la gestion et à la détention d’un patrimoine immobilier.",
        logo: "fa-home",
        color: "#FF9800",
        categorie: 'Civile',
        associes: '2+',
        capital: 'Libre (numéraire ou apports en nature)',
        responsabilite: 'Indéfinie et proportionnelle (chaque associé répond des dettes à hauteur de sa part ; responsabilité non solidaire sauf clause contraire)',
        fiscalite: 'IR par défaut',
        fiscaliteOption: 'IS possible (option irrévocable à exercer dans les 3 mois suivant la constitution ou la clôture de l’exercice)',
        regimeSocial: 'Aucun si le gérant n’est pas rémunéré ; TNS si le gérant associé est rémunéré',
        protectionPatrimoine: 'Non',
        chargesSociales: 'Aucune sans rémunération ; cotisations TNS uniquement sur la rémunération du gérant associé',
        fiscal: 'Non concerné',
        regimeTVA: 'Hors champ pour la location nue d’habitation ; TVA sur option ou si activité de location meublée/marchand de biens',
        publicationComptes: 'Non, sauf si tous les associés sont des sociétés à responsabilité limitée',
        formalites: 'Standard : rédaction de statuts souples, enregistrement, publicité, tenue d’une AG annuelle',
        activite: 'Gestion immobilière',
        leveeFonds: 'Non (pas d’appel public à l’épargne)',
        entreeAssocies: 'Oui (agrément par décision unanime ou majorité définie aux statuts)',
        profilOptimal: 'Gestion et transmission de patrimoine immobilier',
        advantages: [
      "Facilite la détention collective d’un patrimoine immobilier",
      "Souplesse statutaire (répartition des droits et pouvoirs)",
      "Fiscalité transparente à l’IR (déduction des charges réelles)",
      "Option IS possible pour amortir l’immeuble",
      "Outil privilégié pour la transmission (démembrement, donations-partage)",
      "Confidentialité : pas de dépôt des comptes en principe"
        ],
        disadvantages: [
     "Responsabilité illimitée et proportionnelle des associés",
      "Statuts et gestion plus complexes qu’une indivision",
      "Coûts récurrents (AG annuelle, comptabilité recommandée)",
      "Objet strictement civil : interdiction de commerce",
      "Option IS irrévocable et taxable à la sortie (plus-value IS)"
        ],
        suitable_for: [
      "Organisation et gestion d’un patrimoine familial",
      "Transmission immobilière avec démembrement des parts",
      "Investissement locatif à plusieurs",
      "Optimisation fiscale via l’option IS pour amortissement"
        ],
        casConseille: 'Gestion immobilière',
        casDeconseille: 'Activité commerciale ou marchande à forte rotation',
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
        categorie: 'Libérale',
        associes: '2 + (professionnels inscrits)',
        capital: 'Libre (20 % libérés à la constitution ; solde dans les 5 ans, comme en SARL)',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS obligatoire',
        fiscaliteOption: 'IR uniquement pour la SELARL de famille (option rare, conditions cumulatives)',
        regimeSocial: 'TNS si le ou les gérants associés sont majoritaires ; assimilé-salarié si gérant minoritaire/égalitaire ou tiers',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur la rémunération du gérant (TNS ou assimilé) ; aucune cotisation sur dividendes tant qu’ils n’excèdent pas 10 % du capital + primes + CCA',
        fiscal: 'Oui',
        regimeTVA: 'Assujettie en principe ; exonérations ou régimes particuliers pour certaines professions de santé (ex. actes médicaux)',
        publicationComptes: 'Oui',
        formalites: 'Standard : statuts conformes aux règles ordinales, annonce légale, dépôt au greffe, tenue d’AG annuelle',
        activite: 'Exercice en commun d’une profession libérale réglementée',
        leveeFonds: 'Limité (≥ 50 % du capital et des droits de vote doivent rester détenus par des professionnels en exercice)',
        entreeAssocies: 'Oui, sous agrément des associés et respect des règles ordinales',
        profilOptimal: 'Professionnels libéraux souhaitant s’associer et protéger leur patrimoine',
        advantages: [
           "Responsabilité limitée aux apports",
      "Cadre sécurisé pour exercer à plusieurs (règles ordinales)",
      "Image crédible et professionnelle vis-à-vis des clients et banques",
      "Possibilité de déduire toutes les charges à l’IS",
      "Protection du patrimoine personnel des associés",
      "Continuité de l’exploitation en cas de départ d’un associé"
        ],
        disadvantages: [
      "Règles déontologiques strictes propres à chaque profession",
      "Capital majoritairement détenu par des professionnels : limitation des investisseurs extérieurs",
      "Coûts et formalisme de constitution et de fonctionnement (dépôt des comptes, AG, rapports)",
      "Couverture sociale TNS moins protectrice pour les gérants majoritaires",
      "Inéligible à l’option IR (hors SELARL de famille)"
        ],
        suitable_for: [
      "Cabinets d’avocats, d’expertise-comptable, de santé, etc.",
      "Professionnels libéraux souhaitant s’associer tout en limitant leur responsabilité",
      "Structures cherchant à optimiser fiscalement (IS) ou à sécuriser la transmission"
        ],
        casConseille: 'Exercice libéral en groupe, protection patrimoniale',
        casDeconseille: 'Activité purement commerciale ou recherche d’investisseurs externes importants',
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
        description: "Forme de SAS réservée aux professions libérales réglementées (avocats, experts-comptables, médecins, etc.). Permet une gouvernance très souple tout en limitant la responsabilité aux apports.",
        logo: "fa-stethoscope",
        color: "#8BC34A",
        categorie: 'Libérale',
        associes: '1+ (SELASU) ou 2+ (SELAS pluri-associés)',
        capital: 'Libre (≥ 1 €). Au moins 50 % du capital et des droits de vote doivent être détenus par des professionnels en exercice.',
        responsabilite: 'Limitée aux apports (mise en cause personnelle possible en cas de faute de gestion ou manquement déontologique)',
        fiscalite: 'IS obligatoire',
        fiscaliteOption: 'Non (pas d’option IR pour la SELAS classique)',
        regimeSocial: 'Président assimilé salarié (régime général, hors assurance-chômage) ; aucun régime pour les associés non rémunérés',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard de SAS + démarches auprès de l’ordre professionnel compétent ; commissaire aux comptes obligatoire au-delà des seuils légaux',
        activite: 'Exercice en commun d’une profession libérale réglementée',
        leveeFonds: 'Oui, mais limitée par l’obligation de détention majoritaire des professionnels',
        entreeAssocies: 'Oui, sous réserve d’agrément et des règles ordinales',
        profilOptimal: 'Cabinets libéraux recherchant souplesse et image corporate',
        advantages: [
     "Grande souplesse statutaire (gouvernance personnalisable)",
      "Responsabilité limitée aux apports",
      "Protection sociale du régime général pour le président",
      "Adaptée aux professions libérales (conforme aux ordres)",
      "Facilite l’entrée d’investisseurs (actions de préférence, etc.)",
      "Possibilité de rémunérer les associés sous forme de dividendes"
        ],
        disadvantages: [
     "Charges sociales élevées pour le président assimilé salarié",
      "Capital et droits de vote majoritairement réservés aux professionnels",
      "Contraintes déontologiques strictes selon la profession",
      "Coûts de fonctionnement et commissaire aux comptes au-delà des seuils",
      "Formalités supplémentaires auprès de l’ordre professionnel"
        ],
        suitable_for: [
      "Cabinets libéraux en croissance",
      "Structures souhaitant accueillir de nouveaux associés",
      "Professions libérales recherchant une gouvernance flexible"
        ],
        casConseille: 'Professions libérales réglementées',
        casDeconseille: 'Activités purement commerciales',
        transmission: 'Oui (cession d’actions soumise à agrément ordinal)',
        plafondCA: 'Aucun plafond',
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
        id: 'sca',
        name: "Société en Commandite par Actions",
        shortName: "SCA",
        description: "Société commerciale hybride combinant les règles de la Société Anonyme (SA) pour le capital et celles de la commandite simple pour la gouvernance : des associés commandités, responsables indéfiniment, dirigent la société, tandis que des commanditaires, responsables à hauteur de leurs seuls apports, fournissent le capital sans intervenir dans la gestion.",
        logo: "fa-university",
        color: "#607D8B",
        categorie: 'Commerciale',
        associes: '4 minimum (1 commandité + 3 commanditaires) — 7 si appel public à l’épargne',
        capital: '37 000 € (50 % libérés à la constitution, solde dans les 5 ans) — 225 000 € si appel public à l’épargne',
        responsabilite: 'Commandités : indéfinie et solidaire • Commanditaires : limitée à l’apport',
        fiscalite: 'IS obligatoire (aucune option IR)',
        fiscaliteOption: 'Non',
        regimeSocial: 'Commandité gérant et rémunéré : assimilé salarié • Commandité non gérant ou non rémunéré : hors régime • Commanditaires : hors régime")',
        protectionPatrimoine: 'Non',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui',
        regimeTVA: 'Assujettie sur les opérations taxables ; exonération possible si l’activité est elle-même exonérée',
        publicationComptes: 'Oui',
        formalites: 'Constitution complexe : statuts détaillés, commissaires aux comptes, rapport de gestion, dépôt des comptes',
        activite: 'Grandes entreprises, holdings ou groupes familiaux souhaitant séparer gestion et capital et se protéger contre une OPA',
        leveeFonds: 'Oui, levée de fonds possible',
        entreeAssocies: 'Oui',
        profilOptimal: 'Petite ou grande structure nécessitant une levée de fonds',
        advantages: [
      "Stabilité de la direction (commandités difficilement révocables)",
      "Protection contre les OPA hostiles",
      "Séparation claire entre gestion (commandités) et capital (commanditaires)",
      "Accès facilité aux capitaux grâce à l’émission d’actions",
      "Structure appréciée des groupes familiaux souhaitant garder le contrôle"
        ],
        disadvantages: [
      "Responsabilité illimitée pour les commandités",
      "Régime juridique et gouvernance complexes (SA + commandite)",
      "Capital social élevé — 225 000 € si appel public",
      "Frais de constitution et de fonctionnement importants",
      "Forme sociétaire peu courante, parfois mal comprise des partenaires"
        ],
        suitable_for: [
      "Groupes familiaux voulant lever des fonds tout en gardant la direction",
      "Holdings industrielles cherchant une structure anti-OPA",
      "Entreprises nécessitant une distinction forte entre gérance et investisseurs"

        ],
        casConseille: 'Grands groupes ou holdings familiales',
        casDeconseille: 'Entrepreneurs recherchant simplicité et flexibilité',
        transmission: 'Oui',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 3,
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

// Barèmes et filtres (PLACEHOLDERS, À REMPLACER)
   const exclusionFilters = [
    {
        id: "professional_order",
        condition: "yes",
        excluded_statuses: ["MICRO", "SNC"],
        tolerance_message: "Si votre activité est accessoire et non soumise à l'ordre, souhaitez-vous tout de même voir la micro-entreprise ?"
    },
    {
        id: "team_structure",
        condition: "solo",
        excluded_statuses: ["SAS", "SARL", "SA", "SNC", "SCI", "SELARL", "SELAS", "SCA"], 
        tolerance_message: null
    },
    {
        id: "available_capital",
        condition: value => value < 1,
        excluded_statuses: ["SA"],
        tolerance_message: "La SA exige ≥ 37 000 € libérés à 50 % minimum."
    },
    {
        id: "social_regime",
        condition: "assimilated_employee",
        excluded_statuses: ["EI", "MICRO", "SNC"],
        tolerance_message: null
    },
    {
        id: "age",
        condition: "minor",
        excluded_statuses: ["SAS", "SARL", "SA", "EURL", "SASU", "SNC", "SCI", "SELARL", "SELAS", "SCA"],
        tolerance_condition: "emancipated_minor",
        tolerance_message: "Si vous êtes mineur émancipé, certaines sociétés commerciales restent accessibles."
    },
    {
        id: "sharing_instruments",
        condition: value => value && value.length > 0,
        excluded_statuses: ["EI", "MICRO", "SNC"],
        tolerance_message: null
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
        MICRO: 5,
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
        SCA: 3
    },
    governance: {
        EI: 5,
        MICRO: 5,
        EURL: 4,
        SASU: 4,
        SARL: 3,
        SAS: 4,
        SA: 2,
        SNC: 3,
        SCI: 4,
        SELARL: 3,
        SELAS: 4,
        SCA: 2
    },
    fundraising: {
        EI: 1,
        MICRO: 1,
        EURL: 2,
        SASU: 4,
        SARL: 2,
        SAS: 5,
        SA: 4,
        SNC: 1,
        SCI: 1,
        SELARL: 3,
        SELAS: 5,
        SCA: 3
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
        SELAS: 4,
        SCA: 2
    },
    retirement_insurance: {
        EI: 2,
        MICRO: 2,
        EURL: 3,
        SASU: 4,
        SARL: 3,
        SAS: 4,
        SA: 5,
        SNC: 2,
        SCI: 1,
        SELARL: 3,
        SELAS: 4,
        SCA: 4
    },
    administrative_simplicity: {
        EI: 5,
        MICRO: 5,
        EURL: 3,
        SASU: 2,
        SARL: 3,
        SAS: 2,
        SA: 1,
        SNC: 3,
        SCI: 3,
        SELARL: 3,
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
        SNC: 2,
        SCI: 4,
        SELARL: 3,
        SELAS: 3,
        SCA: 1
    },
    transmission: {
        EI: 1,
        MICRO: 1,
        EURL: 3,
        SASU: 4,
        SARL: 3,
        SAS: 5,
        SA: 5,
        SNC: 2,
        SCI: 5,
        SELARL: 3,
        SELAS: 4,
        SCA: 3
    }
};
window.ratingScales = ratingScales;

// ------------------------------------------------
// PARTIE 2: MOTEUR DE RECOMMANDATION (COMPLET)
// ------------------------------------------------

// Gestionnaire d'erreurs spécifique pour ce fichier
window.addEventListener('error', (e) => {
    if (e.filename.includes('recommendation-engine.js') || e.filename.includes('combined-recommendation.js')) {
        console.error('Erreur bloquante dans le moteur de recommandation', e);
    }
}, true);

// Logs de débogage pour traquer le chargement
console.log("Chargement du recommendation-engine.js commencé");
window.engineLoadingStarted = true;

// Règles de scoring configurables
const scoringRules = [
    // Règles pour la protection du patrimoine
    {
        id: 'essential_patrimony_protection',
        description: 'Protection du patrimoine essentielle',
        condition: answers => answers.patrimony_protection === 'essential',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'high_risk_activity_ei_micro',
        description: 'Activité à risque élevé pour EI/MICRO',
        condition: answers => answers.high_professional_risk === 'yes',
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score - 1;
            } else if (statusId === 'EIRL') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'sca_anti_takeover_protection',
        description: 'SCA : protection anti-OPA',
        condition: answers =>
            answers.takeover_protection === 'yes' ||
            answers.hostile_takeover_concern === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SCA') {
                return score + 1.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'sci_patrimony_separation_bonus',
        description: 'SCI : séparation du patrimoine immobilier',
        condition: answers => answers.patrimony_protection === 'essential',
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score + 1;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
    id: 'risk_aversion_liability_shift',
    description: 'Appétence au risque faible : privilégier la responsabilité limitée',
    condition: answers =>
        answers.risk_appetite !== undefined &&
        answers.risk_appetite <= 2,
    apply: (statusId, score) => {
        if (['EI', 'MICRO', 'SNC'].includes(statusId)) {
            return score - 0.5;            // responsabilité illimitée
        }
        if (['SASU', 'SAS', 'SARL', 'EURL', 'SA', 'SCI'].includes(statusId)) {
            return score + 0.5;            // responsabilité limitée
        }
        return score;
    },
    criteria: 'patrimony_protection'
},
{
    id: 'bank_guarantee_liability_penalty',
    description: 'Caution bancaire personnelle : pénalise EI / MICRO',
    condition: answers => answers.bank_guarantee === 'yes',
    apply: (statusId, score) => {
        if (['EI', 'MICRO'].includes(statusId)) {
            return score - 0.5;            // plus exposé
        }
        if (['SASU', 'SAS', 'SARL', 'EURL', 'SA'].includes(statusId)) {
            return score + 0.25;           // structure protectrice
        }
        return score;
    },
    criteria: 'patrimony_protection'
},
{
    id: 'holding_asset_separation_bonus',
    description: 'Holding de tête : bonus pour dissocier patrimoine et opérationnel',
    condition: answers => answers.holding_company === 'yes',
    apply: (statusId, score) => {
        if (['SAS', 'SARL', 'SA'].includes(statusId)) {
            return score + 0.5;
        }
        return score;
    },
    criteria: 'patrimony_protection'
},
        {
        id: 'unlimited_liability_penalty',
        description: 'Responsabilité illimitée pénalisée si protection essentielle ou activité à risque',
        condition: answers =>
            answers.patrimony_protection === 'essential' ||
            answers.high_professional_risk === 'yes',
        apply: (statusId, score) => {
            if (['EI', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 2;        // forte pénalité
            }
            if (statusId === 'SCA') {
                return score - 1;        // commandité SCA : pénalité modérée
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'ei_2022_partial_shield',
        description: "Entreprise individuelle (réforme 2022) : séparation patrimoine pro/perso",
        condition: () => true, // toujours évaluée
        apply: (statusId, score) => {
            if (statusId === 'EI') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'collaborating_spouse_shared_risk',
        description: 'Conjoint collaborateur : accroît le risque sur les formes illimitées',
        condition: answers => answers.collaborating_spouse === 'yes',
        apply: (statusId, score) => {
            if (['EI', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'sci_real_estate_shield',
        description: "Immobilier sans caution bancaire : la SCI isole le bien",
        condition: answers =>
            answers.activity_type === 'immobilier' &&
            answers.bank_guarantee !== 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score + 1;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'eurl_majority_penalty',
        description: 'Associé ≥ 75 % + caution perso : pénalité EURL / SARL',
        condition: answers =>
            parseFloat(answers.capital_percentage || 0) >= 75 &&
            answers.bank_guarantee === 'yes',
        apply: (statusId, score) => {
            if (['EURL', 'SARL'].includes(statusId)) {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    {
        id: 'multiple_housing_units_bonus',
        description: 'Portefeuille immo (> 120 k€ CA) : bonus SCI pour cantonnement',
        condition: answers =>
            answers.activity_type === 'immobilier' &&
            parseFloat(answers.projected_revenue || 0) > 120_000,
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score + 1;
            }
            return score;
        },
        criteria: 'patrimony_protection'
    },
    
    // Règles pour la simplicité administrative
        {
        id: 'high_revenue_small_structures',
        description: 'CA élevé pour petites structures',
        condition: answers => parseFloat(answers.projected_revenue) > 100_000,
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'low_revenue_structure_penalty',
        description: 'Faible CA : structures complexes inadaptées',
        condition: answers => parseFloat(answers.projected_revenue) < 50_000,
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'high_revenue_complex_structures',
        description: 'CA élevé pour structures complexes',
        condition: answers => parseFloat(answers.projected_revenue) > 300_000,
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'accounting_complexity_simple',
        description: 'Préférence pour comptabilité simple',
        condition: answers => answers.accounting_complexity === 'simple',
        apply: (statusId, score) => {
            if (['SAS', 'SA'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'accounting_outsourced_micro',
        description: 'Comptabilité externalisée pour micro',
        condition: answers => answers.accounting_complexity === 'outsourced',
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'sca_large_capital_requirement',
        description: 'SCA : capital disponible < 37 000 €',
        condition: answers => parseFloat(answers.available_capital) < 37_000,
        apply: (statusId, score) => {
            if (statusId === 'SCA') {
                return score - 2;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'sca_complexity_penalty',
        description: 'SCA : complexité pénalisante si CA < 500 k€',
        condition: answers => parseFloat(answers.projected_revenue) < 500_000,
        apply: (statusId, score) => {
            if (statusId === 'SCA') {
                return score - 1.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'non_liberal_sel_exclusion',
        description: 'SEL : exclusion si activité non libérale',
        condition: answers =>
            answers.professional_order !== 'yes' &&
            answers.regulated_profession !== 'yes' &&
            answers.activity_sector !== 'liberal',
        apply: (statusId, score) => {
            if (['SELARL', 'SELAS'].includes(statusId)) {
                return score - 10; // exclusion forte
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'sci_simplicity_penalty',
        description: 'SCI : pénalité si recherche de simplicité comptable',
        condition: answers => answers.accounting_complexity === 'simple',
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
  {
    id: 'vat_regime_micro_bonus',
    description: 'Franchise en base de TVA : bonus pour MICRO',
    condition: answers => answers.vat_regime === 'franchise',
    apply: (statusId, score) =>
      statusId === 'MICRO' ? score + 1 : score,
    criteria: 'administrative_simplicity',
  },
  {
    id: 'vat_regime_real_penalty_micro',
    description: 'Régime réel de TVA sur MICRO ou EI : lourdeur déclarative',
    condition: answers => answers.vat_regime !== 'franchise',
    apply: (statusId, score) =>
      ['MICRO', 'EI'].includes(statusId) ? score - 1 : score,
    criteria: 'administrative_simplicity',
  },
  {
    id: 'solo_project_bonus_solo_status',
    description: 'Projet solo : bonus EI/MICRO/EURL/SASU, malus statuts collectifs',
    condition: answers => answers.team_structure === 'solo',
    apply: (statusId, score) => {
      if (['EI', 'MICRO', 'EURL', 'SASU'].includes(statusId)) return score + 0.5;
      if (
        ['SNC', 'SCI', 'SARL', 'SAS', 'SA', 'SELARL', 'SELAS', 'SCA'].includes(
          statusId,
        )
      )
        return score - 0.5;
      return score;
    },
    criteria: 'administrative_simplicity',
  },
  {
    id: 'associate_number_complexity',
    description: 'Plus de 10 associés : pénalité croissante',
    condition: answers =>
      parseInt(answers.associates_number ?? 0, 10) > 10,
    apply: (statusId, score) => {
      if (['SARL', 'SAS', 'SCI'].includes(statusId)) return score - 1;
      if (['SA', 'SCA'].includes(statusId)) return score - 2;
      return score;
    },
    criteria: 'administrative_simplicity',
  },

  {
    id: 'integration_fiscale_penalty',
    description: 'Intégration fiscale de groupe : complexité supplémentaire',
    condition: answers => answers.tax_integration === 'yes',
    apply: (statusId, score) =>
      ['SAS', 'SARL', 'SA', 'SELAS', 'SELARL'].includes(statusId)
        ? score - 1
        : score,
    criteria: 'administrative_simplicity',
  },
  {
    id: 'holding_structure_penalty',
    description: 'Holding de tête : pénalité de simplicité (sauf SCI)',
    condition: answers => answers.holding_company === 'yes',
    apply: (statusId, score) =>
      statusId !== 'SCI' ? score - 0.5 : score,
    criteria: 'administrative_simplicity',
  },
  {
    id: 'sca_sa_capital_penalty',
    description: 'Capital disponible < 37 000 € : pénalité SA et SCA',
    condition: answers =>
      parseFloat(answers.available_capital ?? 0) < 37_000,
    apply: (statusId, score) =>
      ['SA', 'SCA'].includes(statusId) ? score - 2 : score,
    criteria: 'administrative_simplicity',
  },
  {
    id: 'low_revenue_complex_structure_penalty_v2',
    description: 'CA < 50 k€ : pénalite SAS / SA / SARL / SEL* / SCA',
    condition: answers =>
      parseFloat(answers.projected_revenue ?? 0) < 50_000,
    apply: (statusId, score) =>
      ['SAS', 'SA', 'SARL', 'SELARL', 'SELAS', 'SCA'].includes(statusId)
        ? score - 1
        : score,
    criteria: 'administrative_simplicity',
  },
    {
    id: 'vat_franchise_micro_bonus',
    description: 'Franchise de TVA : formalités ultra-légères pour EI / MICRO',
    condition: answers => answers.vat_regime === 'franchise',
    apply: (statusId, score) => {
        if (['EI', 'MICRO'].includes(statusId)) {
            return score + 0.5;   // ✔ tenue de TVA évitée
        }
        return score;
    },
    criteria: 'administrative_simplicity'
},
{
    id: 'vat_real_micro_penalty',
    description: 'Régime réel / simplifié TVA : surcharge pour EI / MICRO',
    condition: answers =>
        answers.vat_regime === 'real' || answers.vat_regime === 'simplified',
    apply: (statusId, score) => {
        if (['EI', 'MICRO'].includes(statusId)) {
            return score - 0.5;   // ✘ déclarations TVA mensuelles / CA12
        }
        return score;
    },
    criteria: 'administrative_simplicity'
},
{
    id: 'outsourced_complex_accounting_bonus',
    description: 'Comptabilité externalisée : neutralise la complexité des SAS / SA / SARL',
    condition: answers => answers.accounting_complexity === 'outsourced',
    apply: (statusId, score) => {
        if (['SAS', 'SA', 'SARL', 'SELARL', 'SELAS'].includes(statusId)) {
            return score + 0.5;   // ✔ cabinet comptable prend tout en charge
        }
        return score;
    },
    criteria: 'administrative_simplicity'
},
{
    id: 'progressive_contribution_bonus',
    description: 'Apports progressifs : statuts souples sur la libération de capital',
    condition: answers => answers.progressive_contribution === 'yes',
    apply: (statusId, score) => {
        if (['SAS', 'SARL', 'SA', 'SELARL', 'SELAS'].includes(statusId)) {
            return score + 0.25;  // ✔ libération fractionnée autorisée
        }
        return score;
    },
    criteria: 'administrative_simplicity'
},
{
    id: 'vat_exempt_activity_penalty_complex_structures',
    description: 'Activité exonérée de TVA : inutilement lourd pour SAS / SA',
    condition: answers => answers.vat_regime === 'exempt',
    apply: (statusId, score) => {
        if (['SAS', 'SA'].includes(statusId)) {
            return score - 0.25;  // ✘ formalisme société + factures sans TVA
        }
        return score;
    },
    criteria: 'administrative_simplicity'
}
    
    // Règles pour l'optimisation fiscale
    {
        id: 'high_tmi_ir_malus',
        description: 'TMI élevée défavorable pour IR',
        condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (['EI', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 1.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'high_tmi_is_bonus',
        description: 'TMI élevée favorable pour IS',
        condition: answers => ['bracket_41', 'bracket_45'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'low_tmi_micro_bonus',
        description: 'TMI faible favorable pour micro',
        condition: answers => ['non_taxable', 'bracket_11'].includes(answers.tax_bracket),
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score + 1;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'dividend_preference_is',
        description: 'Préférence dividendes favorable pour IS',
        condition: answers => answers.remuneration_preference === 'dividends',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'salary_preference_ir',
        description: 'Préférence salaire favorable pour IR',
        condition: answers => answers.remuneration_preference === 'salary',
        apply: (statusId, score) => {
            if (['EI', 'MICRO'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    {
        id: 'innovation_devices_bonus',
        description: 'Dispositifs innovation (JEI/CIR/CII)',
        condition: answers => answers.jei_cir_cii && answers.jei_cir_cii.length > 0,
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'taxation_optimization'
    },
    
    // Règles pour les charges sociales

        {
        id: 'tns_preference_bonus',
        description: 'Préférence TNS favorable',
        condition: answers => answers.social_regime === 'tns',
        apply: (statusId, score) => {
            if (['EI', 'EIRL', 'MICRO', 'EURL', 'SARL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'employee_preference_bonus',
        description: 'Préférence assimilé salarié favorable',
        condition: answers => answers.social_regime === 'assimilated_employee',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'low_income_micro_bonus',
        description: 'Faibles revenus favorables pour micro',
        condition: answers => parseFloat(answers.income_objective_year1) < 1_500,
        apply: (statusId, score) => {
            if (statusId === 'MICRO') {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'high_income_assimile_malus',
        description: 'Revenus élevés défavorables pour assimilé salarié',
        condition: answers => parseFloat(answers.income_objective_year1) > 5_000,
        apply: (statusId, score) => {
            if (['SASU', 'SAS'].includes(statusId)) {
                return score - 0.5;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    {
        id: 'acre_bonus',
        description: 'Exonération ACRE – bonus transitoire',
        condition: answers => answers.acre === 'yes',
        apply: (_statusId, score) => score + 0.5,
        criteria: 'social_charges'
    },
    {
        id: 'selas_assimile_preference',
        description: 'Libéral : SELAS pour régime assimilé salarié',
        condition: answers =>
            answers.professional_order === 'yes' &&
            answers.social_regime === 'assimilated_employee',
        apply: (statusId, score) => {
            if (statusId === 'SELAS') {
                return score + 1;
            }
            return score;
        },
        criteria: 'social_charges'
    },
    // Règles pour la capacité de financement
    {
        id: 'fundraising_sas_sa_bonus',
        description: 'Levée de fonds favorable pour SAS/SASU/SA',
        condition: answers => answers.fundraising === 'yes',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1.5;
            }
            if (['SARL', 'EURL'].includes(statusId)) {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'sharing_instruments_bonus',
        description: 'Instruments de partage (BSPCE, …)',
        condition: answers =>
            answers.sharing_instruments && answers.sharing_instruments.length > 0,
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'investors_ei_micro_malus',
        description: 'Investisseurs : défavorable pour EI/MICRO',
        condition: answers => answers.team_structure === 'investors',
        apply: (statusId, score) => {
            if (['EI', 'EIRL', 'MICRO', 'SNC'].includes(statusId)) {
                return score - 2;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'liberal_fundraising_selas',
        description: 'Libéral : levée de fonds favorise SELAS',
        condition: answers =>
            answers.professional_order === 'yes' && answers.fundraising === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SELAS') {
                return score + 1.5;
            }
            if (statusId === 'SELARL') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'fundraising_capacity'
    },
    {
        id: 'sca_family_control_with_investors',
        description: 'SCA : contrôle familial + investisseurs externes',
        condition: answers =>
            answers.family_project === 'yes' &&
            answers.fundraising === 'yes' &&
            answers.control_preservation === 'essential',
        apply: (statusId, score) => {
            if (statusId === 'SCA') {
                return score + 2;
            }
            return score;
        },
        criteria: 'governance_flexibility'
    },
    
    // Règles pour la transmission
       {
        id: 'sale_exit_bonus',
        description: 'Sortie par vente – sociétés commerciales',
        condition: answers => answers.exit_intention === 'sale',
        apply: (statusId, score) => {
            if (['SASU', 'SAS', 'SA', 'SARL', 'EURL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'transmission'
    },
    {
        id: 'transmission_exit_bonus',
        description: 'Sortie par transmission – sociétés commerciales',
        condition: answers => answers.exit_intention === 'transmission',
        apply: (statusId, score) => {
            if (['SAS', 'SA', 'SARL'].includes(statusId)) {
                return score + 1;
            }
            return score;
        },
        criteria: 'transmission'
    },
    {
        id: 'family_transmission_sarl_bonus',
        description: 'Transmission familiale : bonus SARL',
        condition: answers => answers.family_transmission === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SARL') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'transmission'
    },
    {
        id: 'sci_family_transmission_bonus',
        description: 'SCI : transmission familiale facilitée',
        condition: answers => answers.family_transmission === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score + 0.5;
            }
            return score;
        },
        criteria: 'transmission'
    },
         // Règles pour les professions libérales réglementées
    {
        id: 'regulated_profession_selarl_bonus',
        description: 'Libéral : SELARL pour profession réglementée',
        condition: answers =>
            answers.professional_order === 'yes' ||
            answers.regulated_profession === 'yes',
        apply: (statusId, score) => {
            if (statusId === 'SELARL') {
                return score + 2;          // fort bonus SELARL
            }
            if (['MICRO', 'EI', 'SNC'].includes(statusId)) {
                return score - 1;          // pénalité pour statuts non adaptés
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
        id: 'regulated_profession_selas_bonus',
        description: 'Libéral : SELAS (flexibilité de gouvernance)',
        condition: answers =>
            answers.professional_order === 'yes' &&
            answers.governance_flexibility === 'essential',
        apply: (statusId, score) => {
            if (statusId === 'SELAS') {
                return score + 2;          // bonus principal SELAS
            }
            if (statusId === 'SELARL') {
                return score + 1;          // bonus secondaire SELARL
            }
            return score;
        },
        criteria: 'governance_flexibility'
    },
     // Règle pour l'activité immobilière
        {
        id: 'immobilier_activity_sci_mega_bonus',
        description: 'Activité immobilière : SCI fortement recommandée',
        condition: answers => answers.activity_type === 'immobilier',
        apply: (statusId, score) => {
            if (statusId === 'SCI') {
                return score + 3; // Bonus fort
            }
            // Pénaliser légèrement les autres formes pour l'immobilier
            if (['MICRO', 'EI'].includes(statusId)) {
                return score - 1;
            }
            return score;
        },
        criteria: 'administrative_simplicity'
    },
    {
    id: 'multiple_partners_bonus_collective',
    description: 'Plusieurs associés : bonus pour statuts pensés pour la gestion collective',
    condition: answers =>
        ['family', 'associates', 'investors'].includes(answers.team_structure) &&
        parseInt(answers.associates_number || 2, 10) >= 2,
    apply: (statusId, score) => {
        if (['SARL', 'SNC', 'SCI'].includes(statusId)) {
            return score + 0.75;      // ✔ collectif facilité
        }
        if (['SASU', 'EURL', 'EI'].includes(statusId)) {
            return score - 0.75;      // ✘ statuts solo par défaut
        }
        return score;
    },
    criteria: 'governance_flexibility',
},
{
    id: 'solo_project_penalty_multi_partner_statutes',
    description: 'Projet solo : pénalise statuts qui exigent ≥ 2 associés',
    condition: answers => answers.team_structure === 'solo',
    apply: (statusId, score) => {
        if (['SNC', 'SCI', 'SARL'].includes(statusId)) {
            return score - 1;
        }
        return score;
    },
    criteria: 'governance_flexibility',
},
{
    id: 'flexible_statutes_bonus',
    description: 'Gouvernance sur-mesure : bonus SAS / SASU / SELAS / SCA',
    condition: answers =>
        answers.governance_complexity === 'complex' ||
        answers.governance_complexity === 'moderate',
    apply: (statusId, score) => {
        if (['SAS', 'SASU', 'SELAS', 'SCA'].includes(statusId)) {
            return score + 1;          // ✔ statuts ultra-flexibles
        }
        if (['SARL', 'SNC', 'SCI', 'EI', 'MICRO'].includes(statusId)) {
            return score - 0.5;        // ✘ rigidité statutaire
        }
        return score;
    },
    criteria: 'governance_flexibility',
},
{
    id: 'simple_governance_penalty_flexible_statutes',
    description: 'Gouvernance très simple souhaitée : SAS / SCA moins pertinentes',
    condition: answers => answers.governance_complexity === 'simple',
    apply: (statusId, score) => {
        if (['SAS', 'SCA'].includes(statusId)) {
            return score - 0.5;
        }
        return score;
    },
    criteria: 'governance_flexibility',
}
    
];
window.scoringRules = scoringRules;

class RecommendationEngine {
    constructor() {
        console.log("Initialisation du RecommendationEngine");
        // Blindage du constructeur - vérification que legalStatuses est disponible
        if (!window.legalStatuses) {
            throw new Error(
                "`window.legalStatuses` est introuvable – vérifie le chargement de legal-status-data.js"
            );
        }
        this.answers = {};
        this.filteredStatuses = {...window.legalStatuses};
        this.scores = {};
        this.weightedScores = {};
        this.priorityWeights = {};
        this.incompatibles = [];
        this.auditTrail = {
            exclusions: [],
            weightingRules: [],
            scores: {}
        };
        
        // Paramètres des seuils pour 2025
        this.thresholds2025 = {
            micro: {
                bic_sales: 188700,
                bic_service: 77700,
                bnc: 77700
            },
            is_reduced_rate_limit: 42500
        };
        
        // Cache pour la mémoïsation
        this.memoizedResults = {};
        
        // Dictionnaire des alternatives pour chaque cas d'incompatibilité
        this.alternativeSuggestions = {
    'MICRO': {
        'ca-depasse-seuil': {
            alternatives: ['EURL', 'SASU'],
            explanation: "Optez pour une EURL ou SASU pour gérer un chiffre d'affaires plus élevé."
        },
        'ordre-professionnel': {
            alternatives: ['SELARL', 'SELAS'],
            explanation: "Pour une profession réglementée, passez en SELARL ou SELAS."
        },
        'fundraising': {
            alternatives: ['SAS', 'SASU'],
            explanation: "Pour lever des fonds, une SAS ou SASU est plus adaptée."
        }
    },

    'EI': {
        'protection-patrimoine': {
            alternatives: ['EURL', 'SASU'],
            explanation: "Choisissez EURL ou SASU pour isoler votre patrimoine personnel."
        },
        'levee-fonds': {
            alternatives: ['SASU', 'SAS'],
            explanation: "Pour accueillir des investisseurs, préférez SASU ou SAS."
        }
    },

    'SNC': {
        'risque-eleve': {
            alternatives: ['SARL', 'SAS'],
            explanation: "Limitez la responsabilité des associés avec une SARL ou une SAS."
        }
    },

    'SELARL': {
        'fundraising': {
            alternatives: ['SELAS', 'SAS'],
            explanation: "Pour ouvrir le capital, basculez en SELAS ou en SAS."
        },
        'besoin-flexibilite-gouvernance': {
            alternatives: ['SELAS', 'SAS'],
            explanation: "Pour plus de souplesse de gouvernance, privilégiez SELAS ou SAS."
        }
    },

    'SELAS': {
        'non-reglemente': {
            alternatives: ['SAS', 'SARL'],
            explanation: "Sans contrainte d'ordre, une SAS ou SARL est plus simple."
        },
        'regime-social-non-souhaite': {
            alternatives: ['SAS', 'SARL'],
            explanation: "Si vous refusez le régime assimilé salarié, envisagez SAS ou SARL."
        }
    },

    'SCA': {
        'capital-insuffisant': {
            alternatives: ['SAS', 'SA'],
            explanation: "Avec moins de 37 000 € de capital, optez pour SAS ou SA."
        },
        'petit-projet': {
            alternatives: ['SAS', 'SARL'],
            explanation: "Pour un petit projet, SAS ou SARL sont plus légères."
        }
    },

    'SCI': {
        'hors-immobilier': {
            alternatives: ['SARL', 'SAS'],
            explanation: "Hors activités immobilières, préférez SARL ou SAS."
        },
        'simplicite-comptable': {
            alternatives: ['EURL', 'SARL'],
            explanation: "Pour moins de formalités, choisissez EURL ou SARL."
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
        console.log("Début du calcul des recommandations", answers);
        // Mémoïsation - vérifier si les résultats sont déjà en cache
        const answersKey = JSON.stringify(answers);
        if (this.memoizedResults[answersKey]) {
            console.log('Résultats récupérés du cache');
            return this.memoizedResults[answersKey];
        }
        
        this.answers = answers;
        
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
        
        // Mémoïsation - stocker les résultats en cache
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
     */
    applyDeclarativeFilters() {
        window.exclusionFilters.forEach(filter => {
            // Vérifier si le filtre s'applique à la réponse
            let shouldExclude = false;
            
            if (typeof filter.condition === 'string') {
                // Condition simple (valeur exacte)
                shouldExclude = this.answers[filter.id] === filter.condition;
            } else if (typeof filter.condition === 'function') {
                // Condition fonction (comparaison complexe)
                try {
                    shouldExclude = filter.condition(this.answers[filter.id]);
                } catch (e) {
                    console.error(`Erreur dans le filtre ${filter.id}:`, e);
                }
            }
            
            // Vérifier si une tolérance est applicable
            if (shouldExclude && filter.tolerance_condition && this.answers[filter.tolerance_condition]) {
                shouldExclude = false;
            }
            
            // Si la condition est remplie, exclure les statuts spécifiés
            if (shouldExclude) {
                this.excludeStatuses(
                    filter.excluded_statuses,
                    filter.tolerance_message || `Exclusion par règle: ${filter.id}`
                );
            }
        });
    }
    
    /**
     * Appliquer les filtres d'exclusion spécifiques (cas particuliers)
     */
applySpecificFilters() {
    // 1. Activité relevant d'un ordre → Micro-entreprise & SNC exclues
    if (this.answers.professional_order === 'yes') {
        this.excludeStatuses(['MICRO', 'SNC'], "Activité relevant d'un ordre professionnel");
    }
    
    // 2. Structure solo → EI & EURL/MICRO conservées, autres exclues
    if (this.answers.team_structure === 'solo') {
        Object.keys(this.filteredStatuses).forEach(statusId => {
            if (!['EI', 'EIRL', 'MICRO', 'EURL', 'SASU'].includes(statusId)) {
                this.excludeStatus(statusId, "Structure solo - un seul associé");
            }
        });
    }
    
    // 3. CA > seuils micro → Micro exclue
    if (this.answers.projected_revenue) {
        const revenue = parseFloat(this.answers.projected_revenue);
        let microThreshold = this.thresholds2025.micro.bic_service; // Par défaut
        
        // Déterminer le seuil applicable selon l'activité
        if (this.answers.activity_type === 'bic_sales') {
            microThreshold = this.thresholds2025.micro.bic_sales;
        } else if (this.answers.activity_type === 'bnc') {
            microThreshold = this.thresholds2025.micro.bnc;
        }
        
        if (revenue > microThreshold) {
            this.excludeStatus('MICRO', `CA prévisionnel (${revenue}€) supérieur au seuil micro (${microThreshold}€)`);
        }
    }
    
    // 4. Levée de fonds → EI/MICRO/SNC exclues
    if (this.answers.fundraising === 'yes') {
        this.excludeStatuses(['EI', 'MICRO', 'SNC'], "Besoin de lever des fonds");
    }
    
    // 5. SEL réservées aux professions libérales réglementées
    const isLiberal = this.answers.activity_sector === 'liberal';
    const hasOrder = this.answers.professional_order === 'yes' || 
                     this.answers.regulated_profession === 'yes';
    if (!hasOrder && !isLiberal) {
        this.excludeStatuses(['SELARL', 'SELAS'], 
            'Statut réservé aux professions libérales réglementées');
    }
    
    // 6. SCA : capital minimum 37 000€
    const capital = parseFloat(this.answers.available_capital || '0');
    if (capital < 37000) {
        this.excludeStatus('SCA', 'Capital insuffisant (minimum 37 000€ requis)');
    }
    
    // 7. SCI : exclusivement pour activités immobilières
 if (this.answers.activity_type && 
    this.answers.activity_type !== 'immobilier') {
    this.excludeStatus('SCI', 'SCI réservée aux activités civiles immobilières');
}
    
    // 8. Risque professionnel élevé → éviter responsabilité illimitée
    if (this.answers.high_professional_risk === 'yes') {
        this.excludeStatuses(['EI', 'MICRO'], 
            'Responsabilité illimitée incompatible avec risque professionnel élevé');
    }
    
    // 9. Régime social souhaité
    if (this.answers.social_regime === 'assimilated_employee') {
        this.excludeStatuses(['EI', 'MICRO', 'EURL', 'SARL', 'SNC'], 
            'Régime assimilé salarié souhaité - statuts TNS exclus');
    } else if (this.answers.social_regime === 'tns') {
        this.excludeStatuses(['SAS', 'SASU', 'SA', 'SELAS'], 
            'Régime TNS souhaité - statuts assimilé salarié exclus');
    }
    
    // 10. Protection du patrimoine essentielle
    if (this.answers.patrimony_protection === 'essential') {
        this.excludeStatuses(['SNC'], 
            'Protection patrimoniale essentielle - responsabilité solidaire exclue');
    }
}
    
    /**
     * Trouve des alternatives pour un statut exclu et une raison donnée
     * @param {string} statusId - Identifiant du statut exclu
     * @param {string} reason - Raison de l'exclusion
     * @returns {Object|null} - Suggestion d'alternative ou null
     */
    findAlternativeSuggestion(statusId, reason) {
        // Convertir la raison en code pour correspondance
        const reasonCode = this.getReasonCode(reason);
        
        if (this.alternativeSuggestions[statusId] && 
            this.alternativeSuggestions[statusId][reasonCode]) {
            return this.alternativeSuggestions[statusId][reasonCode];
        }
        
        // Alternative générique si pas de correspondance spécifique
        return {
            alternatives: this.getGenericAlternatives(statusId),
            explanation: "Consultez les autres formes juridiques recommandées qui évitent cette contrainte"
        };
    }

    /**
     * Convertit une raison textuelle en code pour correspondance
     * @param {string} reason - Raison d'exclusion en texte
     * @returns {string} - Code de raison standardisé
     */
    getReasonCode(reason) {
        // Extraire un code à partir de la description
        if (reason.includes("CA") && reason.includes("seuil")) return "ca-depasse-seuil";
        if (reason.includes("ordre professionnel")) return "ordre-professionnel";
        if (reason.includes("fonds")) return "fundraising";
        if (reason.includes("patrimoine")) return "protection-patrimoine";
        if (reason.includes("risque")) return "risque-eleve";
        
        // Créer un slug à partir du texte
        return reason.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30);
    }

    /**
     * Retourne des alternatives génériques selon le type de statut
     * @param {string} statusId - Identifiant du statut
     * @returns {Array} - Liste d'alternatives possibles
     */
    getGenericAlternatives(statusId) {
        const alternatives = {
            'MICRO': ['EI', 'EURL'],
            'EI': ['MICRO', 'EURL'],
            'EURL': ['SASU', 'SARL'],
            'SASU': ['EURL', 'SAS'],
            'SARL': ['EURL', 'SAS'],
            'SAS': ['SASU', 'SARL'],
            'SNC': ['SARL', 'SAS'],
            'SCI': ['SARL', 'SAS'],
            'SELARL': ['SELAS'],
            'SELAS': ['SELARL']
        };
        
        return alternatives[statusId] || ['EURL', 'SASU'];
    }
    
    /**
     * Exclure un statut juridique
     */
    excludeStatus(statusId, reason) {
        if (this.filteredStatuses[statusId]) {
            const status = this.filteredStatuses[statusId];
            
            // Trouver une suggestion d'alternative
            const suggestion = this.findAlternativeSuggestion(statusId, reason);
            
            // Stocker dans les incompatibilités
            this.incompatibles.push({
                id: statusId,
                name: status.name,
                shortName: status.shortName,
                status: status,
                reason: reason,
                suggestion: suggestion,
                compatibilite: 'INCOMPATIBLE'
            });
            
            delete this.filteredStatuses[statusId];
            
            // Journaliser l'exclusion avec l'alternative
            this.auditTrail.exclusions.push({
                status_id: statusId,
                reason: reason,
                alternative: suggestion ? suggestion.explanation : null
            });
        }
    }
    
    /**
     * Exclure plusieurs statuts juridiques
     */
    excludeStatuses(statusIds, reason) {
        statusIds.forEach(statusId => {
            this.excludeStatus(statusId, reason);
        });
    }

    /**
     * Calculer les poids à appliquer pour chaque critère basé sur les priorités
     */
    calculatePriorityWeights() {
        // Par défaut, tous les critères ont un poids de 1
        const defaultWeights = {
            patrimony_protection: 1,
            administrative_simplicity: 1,
            taxation_optimization: 1,
            social_charges: 1,
            fundraising_capacity: 1,
            credibility: 1,
            governance_flexibility: 1,
            transmission: 1
        };
        
        this.priorityWeights = {...defaultWeights};
        
        // Si les priorités ont été définies
        if (this.answers.priorities && this.answers.priorities.length > 0) {
            // Mapping des IDs de priorité vers les critères
            const priorityMapping = {
                taxation: 'taxation_optimization',
                social_cost: 'social_charges',
                patrimony_protection: 'patrimony_protection',
                governance_flexibility: 'governance_flexibility',
                fundraising: 'fundraising_capacity',
                transmission: 'transmission',
                admin_simplicity: 'administrative_simplicity',
                accounting_cost: 'administrative_simplicity',
                retirement_insurance: 'social_charges'
            };
            
            // Poids selon le rang (1er = 5, 2e = 4, 3e = 3)
            const rankWeights = [5, 4, 3];
            
            // Appliquer les poids selon les priorités
            this.answers.priorities.forEach((priorityId, index) => {
                if (index < 3) { // Limiter à 3 priorités
                    const criteriaKey = priorityMapping[priorityId];
                    if (criteriaKey) {
                        this.priorityWeights[criteriaKey] = rankWeights[index];
                        
                        // Journaliser la règle de pondération
                        this.auditTrail.weightingRules.push({
                            priority: priorityId,
                            rank: index + 1,
                            criteria: criteriaKey,
                            weight: rankWeights[index]
                        });
                    }
                }
            });
        }
        
        console.log('Poids des priorités:', this.priorityWeights);
    }

    /**
     * Calculer les scores pour chaque statut juridique
     */
    calculateScores() {
        const statuses = Object.keys(this.filteredStatuses);
        
        // Pour chaque statut
        statuses.forEach(statusId => {
            // Initialiser le score
            this.scores[statusId] = 0;
            this.weightedScores[statusId] = 0;
            this.auditTrail.scores[statusId] = {};
            
            const status = this.filteredStatuses[statusId];
            const metrics = status.key_metrics;
            
            // Critères et leurs scores
            const criteriaScores = {
                patrimony_protection: this.calculateCriteriaScore('patrimony_protection', statusId, metrics),
                administrative_simplicity: this.calculateCriteriaScore('administrative_simplicity', statusId, metrics),
                taxation_optimization: this.calculateCriteriaScore('taxation_optimization', statusId, metrics),
                social_charges: this.calculateCriteriaScore('social_charges', statusId, metrics),
                fundraising_capacity: this.calculateCriteriaScore('fundraising_capacity', statusId, metrics),
                credibility: metrics.credibility || 3,
                governance_flexibility: metrics.governance_flexibility || 3,
                transmission: this.calculateCriteriaScore('transmission', statusId, metrics)
            };
            
            // Calculer le score total (non pondéré)
            let totalScore = 0;
            let totalWeightedScore = 0;
            let totalWeight = 0;
            
            for (const [criterion, score] of Object.entries(criteriaScores)) {
                const weight = this.priorityWeights[criterion] || 1;
                totalScore += score;
                totalWeightedScore += score * weight;
                totalWeight += weight;
                
                // Journaliser les scores
                this.auditTrail.scores[statusId][criterion] = {
                    raw_score: score,
                    weight: weight,
                    weighted_score: score * weight
                };
            }
            
            this.scores[statusId] = totalScore;
            
            // Normaliser le score pondéré (sur 100)
            this.weightedScores[statusId] = totalWeightedScore / totalWeight * 20;
        });
        
        console.log('Scores pondérés:', this.weightedScores);
    }
    
    /**
     * Calculer le score pour un critère donné en utilisant les règles applicables
     */
    calculateCriteriaScore(criteria, statusId, metrics) {
        // Score de base à partir des métriques du statut
        let score = metrics[criteria] || 3;
        
        // Appliquer toutes les règles correspondant au critère
        const appliedRules = [];
        
        scoringRules
            .filter(rule => rule.criteria === criteria)
            .forEach(rule => {
                // Vérifier si la règle s'applique selon les réponses
                if (rule.condition(this.answers)) {
                    // Calculer le nouveau score
                    const newScore = rule.apply(statusId, score);
                    
                    // Si la règle a modifié le score, l'enregistrer
                    if (newScore !== score) {
                        appliedRules.push({
                            id: rule.id,
                            description: rule.description,
                            impact: newScore - score
                        });
                        
                        // Mettre à jour le score
                        score = newScore;
                    }
                }
            });
        
        // Stocker les règles appliquées dans l'audit trail
        if (appliedRules.length > 0) {
            if (!this.auditTrail.scores[statusId]) {
                this.auditTrail.scores[statusId] = {};
            }
            if (!this.auditTrail.scores[statusId][criteria]) {
                this.auditTrail.scores[statusId][criteria] = {};
            }
            
            this.auditTrail.scores[statusId][criteria].applied_rules = appliedRules;
        }
        
        // Limiter le score entre 0 et 5
        return Math.max(0, Math.min(5, score));
    }
    
    /**
     * Méthode pour expliquer les décisions du moteur de recommandation
     */
    explainRecommendation(statusId) {
        if (!this.auditTrail.scores[statusId]) {
            return "Aucune explication disponible";
        }
        
        let explanation = `Explication pour ${this.filteredStatuses[statusId].name} (${statusId}):\n\n`;
        
        // Expliquer les scores par critère
        for (const [criterion, data] of Object.entries(this.auditTrail.scores[statusId])) {
            explanation += `${criterion}: ${data.raw_score}/5 (poids: ${data.weight})\n`;
            
            if (data.applied_rules && data.applied_rules.length) {
                explanation += "  Règles appliquées:\n";
                data.applied_rules.forEach(rule => {
                    const impact = rule.impact > 0 ? `+${rule.impact}` : rule.impact;
                    explanation += `  - ${rule.description} (${impact})\n`;
                });
            }
        }
        
        // Score final
        explanation += `\nScore final: ${Math.round(this.weightedScores[statusId])}/100\n`;
        
        return explanation;
    }

    /**
     * Génère des stratégies personnalisées pour un statut juridique selon le profil
     * @param {string} statusId - Identifiant du statut juridique
     * @returns {Array} - Liste des stratégies personnalisées
     */
    generateContextualStrategies(statusId) {
        const status = this.filteredStatuses[statusId];
        if (!status) return [];
        
        const strategies = [];
        
        // Stratégies spécifiques par forme juridique
        if (statusId === 'MICRO') {
            strategies.push({
                title: "Optimisation de la trésorerie",
                description: "Profitez de l'absence de TVA sous le seuil de franchise pour améliorer votre trésorerie.",
                icon: "fa-coins"
            });
            
            if (this.answers.tax_bracket === 'non_taxable' || this.answers.tax_bracket === 'bracket_11') {
                strategies.push({
                    title: "Option versement libératoire",
                    description: "Avec votre TMI faible, le versement libératoire de l'impôt est très avantageux.",
                    icon: "fa-percent"
                });
            }
            
            strategies.push({
                title: "Surveillance des seuils",
                description: `Suivez votre CA pour ne pas dépasser les seuils (${this.thresholds2025.micro.bic_sales}€/vente, ${this.thresholds2025.micro.bic_service}€/services).`,
                icon: "fa-chart-line"
            });
        } 
        else if (statusId === 'EURL') {
            if (this.answers.tax_bracket === 'bracket_41' || this.answers.tax_bracket === 'bracket_45') {
                strategies.push({
                    title: "Option IS recommandée",
                    description: "Avec votre TMI élevée, l'IS avec taux réduit à 15% est fiscal-optimisant.",
                    icon: "fa-balance-scale"
                });
            }
            
            strategies.push({
                title: "Charges déductibles",
                description: "Optimisez vos charges réelles déductibles, contrairement au forfait micro-entreprise.",
                icon: "fa-receipt"
            });
        }
        else if (statusId === 'SASU' || statusId === 'SAS') {
            strategies.push({
                title: "Optimisation salaire/dividendes",
                description: "Répartissez judicieusement entre salaire et dividendes selon votre TMI et vos besoins de trésorerie.",
                icon: "fa-percentage"
            });
            
            if (this.answers.fundraising === 'yes') {
                strategies.push({
                    title: "Préparation à la levée de fonds",
                    description: "Préparez une documentation adaptée et des statuts optimisés pour les investisseurs.",
                    icon: "fa-hand-holding-usd"
                });
            }
        }
        
        // Stratégies basées sur les priorités utilisateur
        const priorities = this.answers.priorities || [];
        if (priorities.includes('patrimony_protection')) {
            if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) {
                strategies.push({
                    title: "Renforcement de la protection patrimoniale",
                    description: "Envisagez une assurance RC Pro complémentaire pour une protection maximale.",
                    icon: "fa-shield-alt"
                });
            }
        }
        
        // Stratégies liées aux aides et dispositifs
        if (this.answers.acre === 'yes') {
            strategies.push({
                title: "Exonérations ACRE",
                description: "Profitez de l'exonération partielle de charges sociales pendant la première année.",
                icon: "fa-star"
            });
        }
        
        if (priorities.includes('taxation_optimization') && ['SASU', 'SAS'].includes(statusId)) {
            strategies.push({
                title: "Taux réduit IS",
                description: "Optimisez votre rémunération pour bénéficier du taux IS réduit à 15% jusqu'à 42 500€.",
                icon: "fa-piggy-bank"
            });
        }
        
        return strategies;
    }

    /**
     * Génère le HTML pour afficher les stratégies contextuelles
     * @param {string} statusId - Identifiant du statut
     * @returns {string} - HTML pour les stratégies
     */
    renderContextualStrategies(statusId) {
        const strategies = this.generateContextualStrategies(statusId);
        if (strategies.length === 0) return '';
        
        const status = this.filteredStatuses[statusId];
        
        let html = `
        <div class="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-6">
            <h4 class="font-semibold text-green-400 mb-4">
                <i class="fas fa-lightbulb mr-2"></i>
                Stratégies optimales pour votre ${status.name}
            </h4>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        strategies.forEach(strategy => {
            html += `
            <div class="bg-blue-800 bg-opacity-20 p-4 rounded-lg hover:bg-opacity-30 transition">
                <div class="flex items-start">
                    <div class="bg-green-900 bg-opacity-30 rounded-full p-3 mr-3">
                        <i class="fas ${strategy.icon} text-green-400"></i>
                    </div>
                    <div>
                        <h5 class="font-semibold mb-1">${strategy.title}</h5>
                        <p class="text-sm text-gray-300">${strategy.description}</p>
                    </div>
                </div>
            </div>
            `;
        });
        
        html += `
            </div>
        </div>
        `;
        
        return html;
    }

    /**
     * Obtenir les meilleures recommandations (top N)
     */
    getTopRecommendations(count = 3) {
        // Vérifier qu'il y a au moins un statut disponible
        if (Object.keys(this.filteredStatuses).length === 0) {
            console.error("Aucun statut disponible après application des filtres");
            return [];
        }
        
        // Trier les statuts par score pondéré décroissant
        const sortedStatuses = Object.keys(this.weightedScores)
            .sort((a, b) => this.weightedScores[b] - this.weightedScores[a]);
        
        // Prendre les N premiers
        const topN = Math.min(count, sortedStatuses.length);
        const topStatuses = sortedStatuses.slice(0, topN);
        
        // Construire les objets de recommandation avec catégorisation
        return topStatuses.map((statusId, index) => {
            const score = Math.round(this.weightedScores[statusId]);
            
            // Catégoriser selon le score
            let compatibilite = 'PEU ADAPTÉ';
            if (score >= 80) {
                compatibilite = 'RECOMMANDÉ';
            } else if (score >= 65) {
                compatibilite = 'COMPATIBLE';
            } else if (score < 45) {
                compatibilite = 'DÉCONSEILLÉ';
            }
            
            return {
                rank: index + 1,
                id: statusId,
                name: this.filteredStatuses[statusId].name,
                shortName: this.filteredStatuses[statusId].shortName,
                score: score,
                status: this.filteredStatuses[statusId],
                strengths: this.getStrengths(statusId),
                weaknesses: this.getWeaknesses(statusId),
                compatibilite: compatibilite,
                scoreCriteresStructurels: Math.round(score * 0.6), // Approximation pour compatibilité
                scoreObjectifs: Math.round(score * 0.4), // Approximation pour compatibilité
                scoreDetails: {
                    pourcentage: score
                },
                explanation: this.explainRecommendation(statusId)
            };
        });
    }

    /**
     * Obtenir les forces d'un statut juridique pour le profil
     */
    getStrengths(statusId) {
        const strengths = [];
        const status = this.filteredStatuses[statusId];
        
        // Ajouter les forces spécifiques au profil
        if (statusId === 'MICRO' && this.answers.administrative_simplicity) {
            strengths.push("Simplicité administrative maximale (pas de comptabilité complexe)");
        }
        
        if (['SASU', 'SAS'].includes(statusId) && this.answers.governance_flexibility) {
            strengths.push("Grande liberté statutaire et souplesse de gouvernance");
        }
        
        if (['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId) && this.answers.patrimony_protection === 'essential') {
            strengths.push("Protection complète du patrimoine personnel");
        }
        
        if (['SASU', 'SAS'].includes(statusId) && this.answers.social_regime === 'assimilated_employee') {
            strengths.push("Statut d'assimilé salarié avec protection sociale complète");
        }
        
        // Avantages fiscaux spécifiques
        if ((['SASU', 'SAS', 'SARL', 'EURL'].includes(statusId)) && 
            ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
            strengths.push("Optimisation fiscale avec l'IS à 15% jusqu'à 42 500€ de bénéfices");
        }
        
        if (statusId === 'MICRO' && this.answers.projected_revenue < 50000) {
            strengths.push("Régime fiscal avantageux avec abattement forfaitaire sur le chiffre d'affaires");
        }
        
        // Si pas assez de forces spécifiques, compléter avec des forces génériques
        if (strengths.length < 3 && status.advantages) {
            for (const advantage of status.advantages) {
                if (strengths.length < 3 && !strengths.some(s => s.toLowerCase().includes(advantage.toLowerCase()))) {
                    strengths.push(advantage);
                }
            }
        }
        
        return strengths.slice(0, 3); // Limiter à 3 forces
    }

    /**
     * Obtenir les faiblesses d'un statut juridique pour le profil
     */
    getWeaknesses(statusId) {
        const weaknesses = [];
        const status = this.filteredStatuses[statusId];
        
        // Ajouter les faiblesses spécifiques au profil
        if (['EI', 'MICRO'].includes(statusId) && this.answers.high_professional_risk === 'yes') {
            weaknesses.push("Responsabilité illimitée risquée pour votre activité à risque élevé");
        }
        
        if (['EI', 'MICRO', 'EIRL'].includes(statusId) && this.answers.fundraising === 'yes') {
            weaknesses.push("Difficultés pour lever des fonds ou attirer des investisseurs");
        }
        
        if (['SAS', 'SASU', 'SA'].includes(statusId) && this.answers.projected_revenue < 30000) {
            weaknesses.push("Coûts de gestion potentiellement élevés par rapport au chiffre d'affaires");
        }
        
        if (statusId === 'MICRO' && this.answers.projected_revenue > 0.7 * this.thresholds2025.micro.bic_service) {
            weaknesses.push("Risque de dépassement des seuils du régime micro-entrepreneur");
        }
        
        // Faiblesses fiscales spécifiques
        if (['EI', 'MICRO'].includes(statusId) && ['bracket_41', 'bracket_45'].includes(this.answers.tax_bracket)) {
            weaknesses.push("Imposition à l'IR potentiellement défavorable avec votre TMI élevée");
        }
        
        if ((['SASU', 'SAS'].includes(statusId)) && this.answers.social_regime === 'tns') {
            weaknesses.push("Ne correspond pas à votre préférence pour le régime TNS");
        }
        
        // Si pas assez de faiblesses spécifiques, compléter avec des faiblesses génériques
        if (weaknesses.length < 3 && status.disadvantages) {
            for (const disadvantage of status.disadvantages) {
                if (weaknesses.length < 3 && !weaknesses.some(w => w.toLowerCase().includes(disadvantage.toLowerCase()))) {
                    weaknesses.push(disadvantage);
                }
            }
        }
        
        return weaknesses.slice(0, 3); // Limiter à 3 faiblesses
    }

    /**
     * Affiche les détails d'un statut juridique
     * @param {Object} recommendation - L'objet de recommandation
     */
    showStatusDetails(recommendation) {
        if (!recommendation) return;
        
        const status = recommendation.status;
        
        // Extraire les raisons personnalisées de la recommandation
        const explanations = this.getStatusExplanations(recommendation.id, this.answers);
        
        // Créer l'élément de la modale
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        
        // Contenu de la modale
        modalOverlay.innerHTML = `
            <div class="bg-blue-900 bg-opacity-70 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- En-tête -->
                <div class="flex items-center mb-6 pb-4 border-b border-gray-700">
                    <div class="h-16 w-16 rounded-full bg-blue-800 bg-opacity-50 flex items-center justify-center text-3xl mr-5">
                        <i class="fas ${status.logo || 'fa-building'} text-green-400"></i>
                    </div>
                    <div class="flex-grow">
                        <h2 class="text-2xl font-bold">${status.name} (${status.shortName})</h2>
                        <p class="text-gray-300">${status.description}</p>
                    </div>
                    <div>
                        <span class="px-3 py-1 bg-green-500 text-gray-900 rounded-full font-medium">
                            Score: ${recommendation.score}/100
                        </span>
                    </div>
                </div>
                
                <!-- SECTION PERSONNALISÉE: Pourquoi ce statut est adapté à votre projet -->
                <div class="bg-green-900 bg-opacity-20 p-5 rounded-xl border border-green-800 mb-6">
                    <h3 class="text-xl font-bold mb-3 text-green-400">
                        <i class="fas fa-chart-line mr-2"></i> Pourquoi la ${status.name} est adaptée à votre projet
                    </h3>
                    
                    <div class="mb-4">
                        <p class="text-lg mb-3">Basé sur vos réponses, ce statut est particulièrement recommandé car:</p>
                        <ul class="space-y-3">
                            ${explanations.map(item => `
                                <li class="flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mt-1 mr-2"></i>
                                    <div>
                                        <p class="font-medium">${item.title}</p>
                                        <p class="text-gray-300 text-sm">${item.explanation}</p>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
                
                <!-- Caractéristiques principales -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                        <h3 class="font-semibold mb-2 flex items-center">
                            <i class="fas fa-users mr-2 text-green-400"></i> Structure
                        </h3>
                        <ul class="space-y-2 text-sm">
                            <li class="flex justify-between">
                                <span class="text-gray-400">Associés:</span>
                                <span>${status.associes || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">Capital:</span>
                                <span>${status.capital || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">Responsabilité:</span>
                                <span>${status.responsabilite || 'Non spécifié'}</span>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                        <h3 class="font-semibold mb-2 flex items-center">
                            <i class="fas fa-file-invoice-dollar mr-2 text-green-400"></i> Fiscalité
                        </h3>
                        <ul class="space-y-2 text-sm">
                            <li class="flex justify-between">
                                <span class="text-gray-400">Régime:</span>
                                <span>${status.fiscalite || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">Option:</span>
                                <span>${status.fiscaliteOption || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">TVA:</span>
                                <span>${status.regimeTVA || 'Non spécifié'}</span>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg">
                        <h3 class="font-semibold mb-2 flex items-center">
                            <i class="fas fa-user-shield mr-2 text-green-400"></i> Social
                        </h3>
                        <ul class="space-y-2 text-sm">
                            <li class="flex justify-between">
                                <span class="text-gray-400">Régime:</span>
                                <span>${status.regimeSocial || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">Charges:</span>
                                <span>${status.chargesSociales || 'Non spécifié'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-400">Protection:</span>
                                <span>${status.protectionPatrimoine || 'Non spécifié'}</span>
                            </li>
                        </ul>
                    </div>
                </div>
                
                <!-- Forces et faiblesses -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <!-- Forces -->
                    <div class="bg-green-900 bg-opacity-20 p-4 rounded-lg border border-green-800">
                        <h3 class="font-semibold mb-3 flex items-center text-green-400">
                            <i class="fas fa-plus-circle mr-2"></i> Points forts
                        </h3>
                        <ul class="space-y-2">
                            ${recommendation.strengths.map(strength => `
                                <li class="flex items-start">
                                    <i class="fas fa-check text-green-400 mt-1 mr-2"></i>
                                    <span>${strength}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    
                    <!-- Faiblesses -->
                    <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                        <h3 class="font-semibold mb-3 flex items-center text-red-400">
                            <i class="fas fa-exclamation-circle mr-2"></i> Points d'attention
                        </h3>
                        <ul class="space-y-2">
                            ${recommendation.weaknesses.map(weakness => `
                                <li class="flex items-start">
                                    <i class="fas fa-times text-red-400 mt-1 mr-2"></i>
                                    <span>${weakness}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
                
                <!-- Profils adaptés -->
                <div class="bg-blue-800 bg-opacity-30 p-4 rounded-lg mb-6">
                    <h3 class="font-semibold mb-2 flex items-center text-green-400">
                        <i class="fas fa-thumbs-up mr-2"></i> Profils adaptés
                    </h3>
                    <ul class="space-y-2">
                        ${(status.suitable_for || []).map(item => `
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-400 mt-1 mr-2"></i>
                                <span>${item}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                
                <!-- Boutons d'action -->
                <div class="flex justify-end mt-6">
                    <button id="close-details-modal" class="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg">
                        <i class="fas fa-times mr-2"></i> Fermer
                    </button>
                </div>
            </div>
        `;
        
        // Ajouter la modale au DOM
        document.body.appendChild(modalOverlay);
        
        // Gérer la fermeture
        document.getElementById('close-details-modal').addEventListener('click', () => {
            modalOverlay.remove();
        });
        
        // Fermer en cliquant en dehors du contenu
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    /**
     * Génère des explications personnalisées sur pourquoi un statut est recommandé
     * @param {string} statusId - Identifiant du statut juridique
     * @param {Object} answers - Réponses de l'utilisateur
     * @returns {Array} - Liste d'explications
     */
    getStatusExplanations(statusId, answers) {
        const explanations = [];
        
        // Mapping TMI pour affichage
        const tmiMap = {
            'non_taxable': 'non imposable',
            'bracket_11': '11%',
            'bracket_30': '30%',
            'bracket_41': '41%',
            'bracket_45': '45%'
        };
        
        // 1. FISCALITÉ (TMI)
        if (answers.tax_bracket) {
            const tmiValue = tmiMap[answers.tax_bracket] || '';
            
            if ((statusId === 'SASU' || statusId === 'SAS') && 
                (answers.tax_bracket === 'bracket_41' || answers.tax_bracket === 'bracket_45')) {
                explanations.push({
                    title: "Optimisation fiscale avec votre TMI élevée",
                    explanation: `Avec votre tranche marginale d'imposition à ${tmiValue}, ce statut vous permet de bénéficier de l'IS au taux réduit de 15% jusqu'à 42 500€ de bénéfices au lieu d'une imposition directe à l'IR.`
                });
            } else if ((statusId === 'MICRO') && 
                    (answers.tax_bracket === 'non_taxable' || answers.tax_bracket === 'bracket_11')) {
                explanations.push({
                    title: "Régime fiscal simplifié adapté à votre TMI",
                    explanation: `Avec votre tranche marginale d'imposition ${tmiValue}, la micro-entreprise vous permet de bénéficier d'un abattement forfaitaire avantageux.`
                });
            } else if (statusId === 'EURL') {
                explanations.push({
                    title: "Flexibilité fiscale adaptée à votre situation",
                    explanation: `L'EURL vous permet de choisir entre l'IR et l'IS selon ce qui est le plus avantageux pour votre TMI de ${tmiValue}.`
                });
            }
        }
        
        // 2. PROTECTION DU PATRIMOINE
        if (answers.patrimony_protection === 'essential' && 
            (statusId === 'SASU' || statusId === 'SAS' || statusId === 'SARL' || statusId === 'EURL')) {
            explanations.push({
                title: "Protection optimale de votre patrimoine personnel",
                explanation: "Ce statut répond parfaitement à votre besoin essentiel de protéger votre patrimoine personnel, avec une responsabilité strictement limitée à vos apports."
            });
        }
        
        // 3. RÉGIME SOCIAL
        if (answers.social_regime === 'assimilated_employee' && 
            (statusId === 'SASU' || statusId === 'SAS')) {
            explanations.push({
                title: "Régime social d'assimilé salarié correspondant à vos préférences",
                explanation: "Ce statut vous permet de bénéficier du régime général de la sécurité sociale (assimilé salarié), avec une meilleure protection sociale, comme vous l'avez souhaité."
            });
        } else if (answers.social_regime === 'tns' && 
                (statusId === 'MICRO' || statusId === 'EI' || statusId === 'EURL')) {
            explanations.push({
                title: "Régime TNS correspondant à vos préférences",
                explanation: "Ce statut vous permet de bénéficier du régime social des indépendants que vous avez indiqué préférer, avec généralement des cotisations sociales plus avantageuses."
            });
        }
        
        // 4. VOLUME D'ACTIVITÉ
        if (answers.projected_revenue) {
            const revenue = parseFloat(answers.projected_revenue);
            if (statusId === 'MICRO' && revenue < 77000) {
                explanations.push({
                    title: "Compatible avec votre volume d'activité prévisionnel",
                    explanation: `Avec un CA prévisionnel de ${revenue}€, vous restez sous les seuils de la micro-entreprise tout en bénéficiant de sa simplicité administrative.`
                });
            } else if ((statusId === 'SASU' || statusId === 'SAS') && revenue > 80000) {
                explanations.push({
                    title: "Structure adaptée à votre volume d'activité",
                    explanation: `Avec un CA prévisionnel de ${revenue}€, cette forme juridique offre le cadre adapté pour gérer et développer votre activité sur le long terme.`
                });
            }
        }
        
        // 5. LEVÉE DE FONDS
        if (answers.fundraising === 'yes' && (statusId === 'SASU' || statusId === 'SAS')) {
            explanations.push({
                title: "Structure optimale pour vos besoins de financement",
                explanation: "Ce statut facilite les levées de fonds futures grâce à ses actions et sa structure flexible, parfaitement adapté à votre besoin de financement externe."
            });
        }
        
        // 6. GOUVERNANCE
        if (answers.team_structure === 'investors' && (statusId === 'SAS' || statusId === 'SASU')) {
            explanations.push({
                title: "Gouvernance adaptée à votre structure avec investisseurs",
                explanation: "Cette forme juridique offre la flexibilité nécessaire pour accueillir des investisseurs et structurer la gouvernance selon vos besoins spécifiques."
            });
        }
        
        // Ajouter des explications génériques si nécessaire
        if (explanations.length < 3) {
            // Explications génériques basées sur les points forts du statut
            const genericExplanations = {
                'SASU': [
                    {
                        title: "Structure flexible et évolutive",
                        explanation: "La SASU offre une grande liberté statutaire et peut évoluer facilement vers une SAS multi-actionnaires si votre projet se développe."
                    },
                    {
                        title: "Image professionnelle renforcée",
                        explanation: "Ce statut confère une image professionnelle et crédible auprès de vos partenaires et clients potentiels."
                    }
                ],
                'MICRO': [
                    {
                        title: "Simplicité administrative maximale",
                        explanation: "La micro-entreprise vous permet de démarrer rapidement avec un minimum de formalités et une comptabilité ultra-simplifiée."
                    },
                    {
                        title: "Charges calculées uniquement sur le CA réalisé",
                        explanation: "Vous ne payez des cotisations que sur les revenus effectivement encaissés, idéal pour une activité en démarrage ou à temps partiel."
                    }
                ],
                'EURL': [
                    {
                        title: "Équilibre entre simplicité et protection",
                        explanation: "L'EURL offre un bon compromis entre simplicité administrative et protection du patrimoine personnel."
                    },
                    {
                        title: "Crédibilité commerciale",
                        explanation: "Ce statut est bien connu et reconnu, ce qui renforce votre crédibilité auprès des partenaires commerciaux et financiers."
                    }
                ]
            };
            
            // Ajouter les explications génériques pour ce statut
            if (genericExplanations[statusId]) {
                genericExplanations[statusId].forEach(exp => {
                    if (explanations.length < 3) {
                        explanations.push(exp);
                    }
                });
            }
        }
        
        // Si toujours pas assez d'explications, ajouter une générique basée sur le score
        if (explanations.length < 3) {
            explanations.push({
                title: "Structure globalement adaptée à votre profil",
                explanation: "Après analyse complète de vos réponses, notre algorithme a déterminé que ce statut présente le meilleur équilibre entre tous les critères importants pour votre situation."
            });
        }
        
        return explanations;
    }
    
    /**
     * Afficher les détails d'un statut juridique avec analyse personnalisée
     */
    displayResults(recommendations) {
        console.log("Affichage des résultats:", recommendations);
        // Récupérer les conteneurs
        const resultsContainer = document.getElementById('results-container');
        const questionContainer = document.getElementById('question-container');
        
        if (!resultsContainer) {
            console.error('Conteneur de résultats non trouvé');
            return;
        }
        
        // Masquer le conteneur de questions et afficher celui des résultats
        if (questionContainer) questionContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        if (recommendations.length === 0) {
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
            
            document.getElementById('restart-btn').addEventListener('click', () => {
                location.reload();
            });
            
            return;
        }
        
        // Créer le contenu des résultats
        let resultsHTML = `
            <div class="results-container">
                <div class="text-center mb-10">
                    <h2 class="text-3xl font-bold mb-3">Votre statut juridique recommandé</h2>
                    <p class="text-lg text-gray-300">Basé sur vos réponses, voici les formes juridiques les plus adaptées à votre projet</p>
                </div>
                
                <div class="recommendation-cards">
        `;
        
        // Carte pour chaque recommandation
        recommendations.forEach((recommendation, index) => {
            const status = recommendation.status;
            const isMainRecommendation = index === 0;
            
            resultsHTML += `
                <div class="recommendation-card ${isMainRecommendation ? 'main-recommendation' : ''} bg-opacity-60 bg-blue-900 rounded-xl overflow-hidden mb-8 border ${isMainRecommendation ? 'border-green-400' : 'border-gray-700'}">
                    <!-- En-tête -->
                    <div class="p-6 flex items-center border-b border-gray-700 ${isMainRecommendation ? 'bg-green-900 bg-opacity-30' : ''}">
                        <div class="h-16 w-16 rounded-full bg-opacity-30 ${isMainRecommendation ? 'bg-green-800' : 'bg-blue-800'} flex items-center justify-center text-3xl mr-5">
                            <i class="fas ${status.logo || 'fa-building'} ${isMainRecommendation ? 'text-green-400' : 'text-gray-300'}"></i>
                        </div>
                        <div class="flex-grow">
                            <div class="flex justify-between items-center">
                                <h3 class="text-2xl font-bold">${status.name}</h3>
                                <div class="score-badge ${isMainRecommendation ? 'bg-green-500 text-gray-900' : 'bg-blue-700'} px-3 py-1 rounded-full text-sm font-medium">
                                    Score: ${recommendation.score}/100
                                </div>
                            </div>
                            <p class="text-gray-400 mt-1">
                                ${isMainRecommendation ? 'Recommandation principale' : `Alternative ${index}`}
                            </p>
                        </div>
                    </div>
                    
                    <!-- Contenu -->
                    <div class="p-6">
                        <p class="mb-5">${status.description}</p>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Forces -->
                            <div>
                                <h4 class="font-semibold mb-2 flex items-center text-green-400">
                                    <i class="fas fa-check-circle mr-2"></i> Points forts
                                </h4>
                                <ul class="space-y-2">
                                    ${recommendation.strengths.map(strength => `
                                        <li class="flex items-start">
                                            <i class="fas fa-plus-circle text-green-400 mt-1 mr-2"></i>
                                            <span>${strength}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                            
                            <!-- Faiblesses -->
                            <div>
                                <h4 class="font-semibold mb-2 flex items-center text-red-400">
                                    <i class="fas fa-exclamation-circle mr-2"></i> Points d'attention
                                </h4>
                                <ul class="space-y-2">
                                    ${recommendation.weaknesses.map(weakness => `
                                        <li class="flex items-start">
                                            <i class="fas fa-minus-circle text-red-400 mt-1 mr-2"></i>
                                            <span>${weakness}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Boutons d'action -->
                        <div class="mt-6 flex justify-end">
                            <button class="details-btn bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg mr-3" data-status-id="${status.shortName}">
                                <i class="fas fa-info-circle mr-2"></i> Plus de détails
                            </button>
                            ${isMainRecommendation ? `
                                <button class="download-btn bg-green-500 hover:bg-green-400 text-gray-900 font-medium px-4 py-2 rounded-lg">
                                    <i class="fas fa-file-download mr-2"></i> Télécharger le PDF
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Ajouter les stratégies contextuelles pour la recommandation principale
        if (recommendations.length > 0) {
            resultsHTML += this.renderContextualStrategies(recommendations[0].id);
        }
        
        // Afficher les incompatibilités
        resultsHTML += this.displayIncompatibilities(this.incompatibles);
        
        // Fermer les conteneurs
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
        
        // Injecter le HTML dans le conteneur
        resultsContainer.innerHTML = resultsHTML;
        
        // Attacher les événements
        document.getElementById('restart-btn').addEventListener('click', () => {
            location.reload();
        });
        
        document.getElementById('compare-btn').addEventListener('click', () => {
            alert('Fonctionnalité de comparaison à implémenter');
        });
        
        // Événements pour les boutons de détails
        document.querySelectorAll('.details-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const statusId = btn.dataset.statusId;
                const recommendationObject = recommendations.find(r => r.status.shortName === statusId);
                if (recommendationObject) {
                    this.showStatusDetails(recommendationObject);
                }
            });
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
     * @param {Array} incompatibles - Liste des statuts incompatibles
     * @returns {string} - HTML pour l'affichage des incompatibilités
     */
    displayIncompatibilities(incompatibles) {
        if (!incompatibles || incompatibles.length === 0) return '';
        
        let html = `
            <div class="mt-8 mb-6">
                <h3 class="text-xl font-bold text-red-400 mb-4 flex items-center">
                    <i class="fas fa-exclamation-triangle mr-2"></i> 
                    Formes juridiques incompatibles avec votre profil
                </h3>
                <div class="bg-blue-900 bg-opacity-20 p-4 rounded-xl">
                    <p class="mb-4">Les structures suivantes présentent des incompatibilités avec vos critères :</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        `;
        
        // Regrouper les incompatibilités par forme juridique
        const incompatibilitiesByForm = {};
        
        incompatibles.forEach(inc => {
            if (!incompatibilitiesByForm[inc.id]) {
                incompatibilitiesByForm[inc.id] = {
                    form: inc.status,
                    reasons: [],
                    suggestions: []
                };
            }
            
            // Ajouter la raison si nouvelle
            if (!incompatibilitiesByForm[inc.id].reasons.some(r => r === inc.reason)) {
                incompatibilitiesByForm[inc.id].reasons.push(inc.reason);
            }
            
            // Ajouter la suggestion si nouvelle et non déjà présente
            if (inc.suggestion && !incompatibilitiesByForm[inc.id].suggestions.some(
                s => s.explanation === inc.suggestion.explanation
            )) {
                incompatibilitiesByForm[inc.id].suggestions.push(inc.suggestion);
            }
        });
        
        // Générer le HTML pour chaque forme incompatible
        Object.values(incompatibilitiesByForm).forEach(item => {
            html += `
                <div class="bg-red-900 bg-opacity-20 p-4 rounded-lg border border-red-800">
                    <h4 class="font-semibold text-red-400 mb-2">${item.form.name}</h4>
                    <ul class="text-sm">
            `;
            
            item.reasons.forEach(reason => {
                html += `<li class="mb-1 flex items-start">
                    <i class="fas fa-times text-red-400 mr-2 mt-1"></i>
                    <span>${reason}</span>
                </li>`;
            });
            
            // Ajouter les suggestions alternatives
            if (item.suggestions.length > 0) {
                html += `<li class="mt-3 pt-2 border-t border-red-800"></li>`;
                
                item.suggestions.forEach(suggestion => {
                    html += `
                        <li class="mt-2 flex items-start">
                            <i class="fas fa-lightbulb text-yellow-400 mr-2 mt-1"></i>
                            <span><strong>Alternative :</strong> ${suggestion.explanation}</span>
                        </li>
                    `;
                });
            }
            
            html += `
                    </ul>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
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
