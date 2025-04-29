// legal-status-data.js - Données sur les statuts juridiques d'entreprise

// Statuts juridiques et leurs caractéristiques
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
        fiscaliteOption: 'Non',
        regimeSocial: 'TNS',
        protectionPatrimoine: 'Oui (depuis 2022)',
        chargesSociales: 'Simplifiées',
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
            "Régime fiscal forfaitaire avantageux si faibles charges"
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
            patrimony_protection: 1,
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
        fiscaliteOption: 'IS (option possible)',
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
            "Création simple et rapide",
            "Pas de capital minimum requis",
            "Formalités administratives réduites",
            "Régime fiscal de l'IR par défaut",
            "Comptabilité simplifiée possible",
            "Liberté de gestion totale"
        ],
        disadvantages: [
            "Responsabilité illimitée sur les biens personnels",
            "Crédibilité parfois limitée auprès des partenaires",
            "Difficultés pour lever des fonds",
            "Protection sociale minimale",
            "Revente de l'entreprise plus complexe"
        ],
        suitable_for: [
            "Activités à faible risque",
            "Entrepreneurs débutants",
            "Projets nécessitant peu d'investissement",
            "Activités de service à faible engagement financier"
        ],
        casConseille: 'Artisan, commerçant',
        casDeconseille: 'Projet à risque élevé',
        transmission: 'Non',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 1,
            administrative_simplicity: 5,
            taxation_optimization: 3,
            social_charges: 3,
            fundraising_capacity: 1,
            credibility: 2,
            governance_flexibility: 5,
            transmission: 1
        }
    },
    "EURL": {
        id: 'eurl',
        name: "Entreprise Unipersonnelle à Responsabilité Limitée",
        shortName: "EURL",
        description: "SARL à associé unique, permettant de créer une société avec un seul associé.",
        logo: "fa-shield-alt",
        color: "#3F51B5",
        categorie: 'Commerciale',
        associes: '1',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IR ou IS',
        fiscaliteOption: 'Oui',
        regimeSocial: 'TNS ou Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Dividendes possibles',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Modérées',
        activite: 'Toutes',
        leveeFonds: 'Limité',
        entreeAssocies: 'Possible',
        profilOptimal: 'Entrepreneur solo cherchant séparation patrimoine',
        advantages: [
            "Responsabilité limitée aux apports",
            "Crédibilité commerciale",
            "Choix du régime fiscal (IR ou IS)",
            "Possibilité d'évoluer en SARL",
            "Pas de capital social minimum",
            "Régime social avantageux avec l'option TNS"
        ],
        disadvantages: [
            "Formalités de création et fonctionnement",
            "Coûts de création et de gestion",
            "Charges sociales plus élevées si gérant majoritaire",
            "Contraintes comptables importantes",
            "Formalisme juridique à respecter",
            "Moins de souplesse que la SASU"
        ],
        suitable_for: [
            "Entrepreneurs souhaitant protéger leur patrimoine",
            "Activités nécessitant une image de marque solide",
            "Projets pouvant accueillir d'autres associés à terme",
            "Activités à risque modéré"
        ],
        casConseille: 'Activité avec risques',
        casDeconseille: 'Petit CA sans risque',
        transmission: 'Oui',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 4,
            administrative_simplicity: 3,
            taxation_optimization: 4,
            social_charges: 3,
            fundraising_capacity: 2,
            credibility: 4,
            governance_flexibility: 3,
            transmission: 3
        }
    },
    "SASU": {
        id: 'sasu',
        name: "Société par Actions Simplifiée Unipersonnelle",
        shortName: "SASU",
        description: "Forme simplifiée de la SAS, avec un actionnaire unique.",
        logo: "fa-chart-line",
        color: "#673AB7",
        categorie: 'Commerciale',
        associes: '1',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS',
        fiscaliteOption: 'Non',
        regimeSocial: 'Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Dividendes possibles',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Modérées',
        activite: 'Toutes',
        leveeFonds: 'Oui',
        entreeAssocies: 'Facile',
        profilOptimal: 'Entrepreneur solo cherchant statut salarié',
        advantages: [
            "Grande souplesse statutaire",
            "Responsabilité limitée aux apports",
            "Régime social du salarié pour le président",
            "Facilité pour faire entrer des investisseurs",
            "Pas de capital minimum",
            "Image professionnelle",
            "Adaptée aux levées de fonds et instruments financiers (BSPCE, AGA...)"
        ],
        disadvantages: [
            "Coûts de création et de gestion élevés",
            "Formalisme juridique important",
            "Imposition obligatoire à l'IS (sauf option temporaire)",
            "Comptabilité plus complexe",
            "Charges sociales élevées (assimilé salarié)",
            "Coût des assemblées générales annuelles"
        ],
        suitable_for: [
            "Projets innovants avec perspectives de levée de fonds",
            "Entrepreneurs souhaitant être assimilés salariés",
            "Activités à fort potentiel de croissance",
            "Consultant ou prestataire souhaitant une image corporate",
            "Projets visant une évolution en SAS multi-actionnaires"
        ],
        casConseille: 'Salaire élevé, levée de fonds',
        casDeconseille: 'Petit CA',
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
        description: "Société commerciale où la responsabilité des associés est limitée aux apports.",
        logo: "fa-briefcase",
        color: "#2196F3",
        categorie: 'Commerciale',
        associes: '2-100',
        capital: '1€ minimum',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS (IR option 5 ans)',
        fiscaliteOption: 'Oui',
        regimeSocial: 'TNS (gérant majoritaire), Assimilé salarié (gérant minoritaire/égalitaire)',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Selon statut gérant',
        fiscal: 'Oui, selon IS/IR',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Toutes sauf réglementées',
        leveeFonds: 'Limité',
        entreeAssocies: 'Modéré',
        profilOptimal: 'PME familiale',
        advantages: [
            "Responsabilité limitée aux apports",
            "Pas de capital social minimum",
            "Structure bien connue des partenaires",
            "Stabilité de la structure",
            "Crédibilité auprès des tiers",
            "Régime fiscal adaptable (IS ou IR sous conditions)"
        ],
        disadvantages: [
            "Formalisme juridique important",
            "Frais de constitution et de fonctionnement",
            "Régime social et fiscal moins avantageux pour le gérant majoritaire",
            "Moins souple que la SAS",
            "Cession de parts sociales encadrée",
            "Procédures de décisions parfois lourdes"
        ],
        suitable_for: [
            "Petites et moyennes entreprises",
            "Projets portés par plusieurs associés",
            "Activités commerciales traditionnelles",
            "Sociétés familiales",
            "Reprise d'entreprise"
        ],
        casConseille: 'PME, activité familiale',
        casDeconseille: 'Start-up, levée de fonds',
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
        description: "Société civile destinée à la gestion d'un patrimoine immobilier.",
        logo: "fa-home",
        color: "#FF9800",
        categorie: 'Civile',
        associes: '2+',
        capital: 'Libre',
        responsabilite: 'Indéfinie',
        fiscalite: 'IR (IS option)',
        fiscaliteOption: 'Oui',
        regimeSocial: 'TNS ou assimilé salarié',
        protectionPatrimoine: 'Non',
        chargesSociales: 'Selon statut',
        fiscal: 'Non concerné',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Gestion immobilière',
        leveeFonds: 'Non',
        entreeAssocies: 'Oui',
        profilOptimal: 'Gestion patrimoine immobilier',
        advantages: [
            "Facilite la transmission du patrimoine immobilier",
            "Permet de détenir un bien à plusieurs",
            "Souplesse dans les statuts",
            "Fiscalité avantageuse (IR par défaut)",
            "Protection contre l'indivision",
            "Gestion du patrimoine immobilier facilitée"
        ],
        disadvantages: [
            "Responsabilité indéfinie des associés",
            "Formalisme juridique",
            "Coûts de fonctionnement",
            "Uniquement pour gestion immobilière",
            "Pas adapté aux activités commerciales"
        ],
        suitable_for: [
            "Gestion de patrimoine immobilier",
            "Transmission immobilière",
            "Détention d'immeubles à plusieurs",
            "Optimisation fiscale immobilière"
        ],
        casConseille: 'Gestion immobilière',
        casDeconseille: 'Activité commerciale',
        transmission: 'Oui',
        plafondCA: 'Aucun plafond',
        key_metrics: {
            patrimony_protection: 2,
            administrative_simplicity: 3,
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
        description: "Forme de SARL adaptée aux professions libérales réglementées.",
        logo: "fa-user-md",
        color: "#00BCD4",
        categorie: 'Libérale',
        associes: '2+',
        capital: 'Libre',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS',
        fiscaliteOption: 'Non',
        regimeSocial: 'TNS ou assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Selon statut',
        fiscal: 'Oui',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Professions libérales réglementées',
        leveeFonds: 'Oui',
        entreeAssocies: 'Oui',
        profilOptimal: 'Professions libérales',
        advantages: [
            "Responsabilité limitée aux apports",
            "Structure adaptée aux professions libérales",
            "Réglementation spécifique au secteur d'activité",
            "Possibilité d'exercer à plusieurs",
            "Protection du patrimoine personnel",
            "Crédibilité vis-à-vis des tiers"
        ],
        disadvantages: [
            "Contraintes spécifiques selon la profession",
            "Formalisme juridique",
            "Coûts de fonctionnement",
            "Restrictions sur la détention du capital",
            "Obligations déontologiques strictes"
        ],
        suitable_for: [
            "Médecins, avocats, experts-comptables",
            "Professions libérales réglementées souhaitant s'associer",
            "Professionnels cherchant à protéger leur patrimoine"
        ],
        casConseille: 'Professions libérales',
        casDeconseille: 'Activité commerciale',
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
        description: "Forme de SAS adaptée aux professions libérales réglementées.",
        logo: "fa-stethoscope",
        color: "#8BC34A",
        categorie: 'Libérale',
        associes: '2+',
        capital: 'Libre',
        responsabilite: 'Limitée aux apports',
        fiscalite: 'IS',
        fiscaliteOption: 'Non',
        regimeSocial: 'Assimilé salarié',
        protectionPatrimoine: 'Oui',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Standard',
        activite: 'Professions libérales réglementées',
        leveeFonds: 'Oui',
        entreeAssocies: 'Oui',
        profilOptimal: 'Professions libérales',
        advantages: [
            "Grande souplesse statutaire",
            "Responsabilité limitée aux apports",
            "Adaptée aux professions libérales",
            "Protection sociale du régime général",
            "Facilite l'entrée d'investisseurs",
            "Gouvernance personnalisable"
        ],
        disadvantages: [
            "Charges sociales élevées",
            "Contraintes spécifiques selon la profession",
            "Restrictions sur la détention du capital",
            "Coûts de fonctionnement élevés",
            "Obligations déontologiques strictes"
        ],
        suitable_for: [
            "Professions libérales avec multiple associés",
            "Structures cherchant à attirer des investisseurs",
            "Cabinets de professionnels en développement"
        ],
        casConseille: 'Professions libérales',
        casDeconseille: 'Activité commerciale',
        transmission: 'Oui',
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
        description: "Société hybride combinant SAS et SNC, avec des commandités (responsabilité illimitée) et des commanditaires (responsabilité limitée).",
        logo: "fa-university",
        color: "#607D8B",
        categorie: 'Commerciale',
        associes: '2+ (au moins deux associés)',
        capital: '37 000 € (5 commanditaires minimum)',
        responsabilite: 'Commandités (responsabilité illimitée) et commanditaires (responsabilité limitée à l'apport)',
        fiscalite: 'IS',
        fiscaliteOption: 'Non',
        regimeSocial: 'Assimilé salarié (commandité)',
        protectionPatrimoine: 'Non',
        chargesSociales: 'Sur rémunération',
        fiscal: 'Oui',
        regimeTVA: 'Oui',
        publicationComptes: 'Oui',
        formalites: 'Complexe',
        activite: 'Grandes entreprises uniquement',
        leveeFonds: 'Oui, levée de fonds possible',
        entreeAssocies: 'Oui',
        profilOptimal: 'Petite ou grande structure nécessitant une levée de fonds',
        advantages: [
            "Stabilité de la direction",
            "Protection contre les OPA hostiles",
            "Distinction entre direction et investisseurs",
            "Accès au capital",
            "Adaptée pour les groupes familiaux",
            "Levée de fonds facilitée"
        ],
        disadvantages: [
            "Structure complexe",
            "Responsabilité illimitée pour les commandités",
            "Capital minimal de 37 000€",
            "Frais de constitution élevés",
            "Formalisme important",
            "Peu répandue (méconnue des partenaires)"
        ],
        suitable_for: [
            "Entreprises familiales souhaitant lever des fonds",
            "Groupes cherchant à se prémunir contre les OPA",
            "Structures cherchant à séparer direction et capital"
        ],
        casConseille: 'Petite ou grande structure nécessitant une levée de fonds',
        casDeconseille: 'Structures recherchant la simplicité',
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
window.legalStatuses = legalStatuses;

// Barèmes 2025 pour les régimes fiscaux et sociaux
const scales2025 = {
    // Seuils micro-entreprise 2025
    micro: {
        bic_sales: 188700,
        bic_service: 77700,
        bnc: 77700,
        vat_franchise_bic_sales: 94300,
        vat_franchise_bic_service: 36800,
        vat_franchise_bnc: 36800
    },
    
    // Taux de cotisations sociales 2025
    social_contributions: {
        micro_bic_sales: 12.3,
        micro_bic_service: 21.2,
        micro_bnc: 21.1,
        tns_minimum: 40,
        tns_maximum: 45,
        assimilated_employee: 80
    },
    
    // Barème IR 2025 (tranches)
    income_tax: {
        brackets: [
            { limit: 11294, rate: 0 },
            { limit: 28797, rate: 11 },
            { limit: 82341, rate: 30 },
            { limit: 177106, rate: 41 },
            { limit: Infinity, rate: 45 }
        ],
        flat_tax_rate: 30 // PFU (Prélèvement Forfaitaire Unique)
    },
    
    // Taux IS 2025
    corporate_tax: {
        reduced_rate_limit: 42500,
        reduced_rate: 15,
        standard_rate: 25
    }
};
window.scales2025 = scales2025;

// Critères d'exclusion primaire (filtres "killer")
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

// Barème de notation des statuts (0-5) par critère
const ratingScales = {
    taxation: {
        EI: 3,
        MICRO: 4,
        EURL: 4,
        SASU: 4,
        SARL: 3,
        SAS: 4,
        SA: 3,
        SNC: 4,
        SCI: 4,
        SELARL: 3,
        SELAS: 3,
        SCA: 3
    },
    social_cost: {
        EI: 3,
        MICRO: 4,
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
        EI: 1,
        MICRO: 1,
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
        EURL: 3,
        SASU: 5,
        SARL: 2,
        SAS: 5,
        SA: 2,
        SNC: 4,
        SCI: 4,
        SELARL: 3,
        SELAS: 5,
        SCA: 3
    },
    fundraising: {
        EI: 1,
        MICRO: 1,
        EURL: 2,
        SASU: 5,
        SARL: 3,
        SAS: 5,
        SA: 5,
        SNC: 2,
        SCI: 1,
        SELARL: 2,
        SELAS: 4,
        SCA: 5
    },
    flexibility: {
        EI: 5,
        MICRO: 5,
        EURL: 3,
        SASU: 5,
        SARL: 2,
        SAS: 5,
        SA: 1,
        SNC: 4,
        SCI: 4,
        SELARL: 3,
        SELAS: 5,
        SCA: 3
    },
    retirement_insurance: {
        EI: 2,
        MICRO: 2,
        EURL: 3,
        SASU: 5,
        SARL: 3,
        SAS: 5,
        SA: 5,
        SNC: 2,
        SCI: 2,
        SELARL: 3,
        SELAS: 5,
        SCA: 5
    },
    administrative_simplicity: {
        EI: 5,
        MICRO: 5,
        EURL: 3,
        SASU: 2,
        SARL: 2,
        SAS: 1,
        SA: 1,
        SNC: 3,
        SCI: 3,
        SELARL: 2,
        SELAS: 2,
        SCA: 1
    },
    accounting_cost: {
        EI: 4,
        MICRO: 5,
        EURL: 3,
        SASU: 2,
        SARL: 2,
        SAS: 1,
        SA: 1,
        SNC: 3,
        SCI: 3,
        SELARL: 2,
        SELAS: 2,
        SCA: 1
    },
    transmission: {
        EI: 1,
        MICRO: 1,
        EURL: 3,
        SASU: 4,
        SARL: 4,
        SAS: 5,
        SA: 5,
        SNC: 2,
        SCI: 5,
        SELARL: 4,
        SELAS: 4,
        SCA: 4
    }
};
window.ratingScales = ratingScales;

// Fonction utilitaire pour récupérer un statut par ID
function getById(id) {
    return legalStatuses[id];
}

// Exposer via l'ancien système de compatibilité 
window.FormeJuridiqueDB = {
    structures: Object.values(legalStatuses),
    getById: getById
};
