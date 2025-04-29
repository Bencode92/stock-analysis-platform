// legal-status-data.js - Données sur les statuts juridiques d'entreprise

// Statuts juridiques et leurs caractéristiques
export const legalStatuses = {
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
    // Autres statuts omis pour brièveté...
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
    }
    // Note: Les autres statuts ont été omis pour garder le fichier concis mais sont présents dans le code réel
};

// Barèmes 2025 pour les régimes fiscaux et sociaux
export const scales2025 = {
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

// Critères d'exclusion primaire (filtres "killer")
export const exclusionFilters = [
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

// Barème de notation des statuts (0-5) par critère
export const ratingScales = {
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
    // Autres barèmes...
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
    }
    // Autres critères omis pour brièveté
};

// Fonction utilitaire pour récupérer un statut par ID
export function getById(id) {
    return legalStatuses[id];
}

// Objet pour la compatibilité avec l'ancien code (accessible globalement)
export const FormeJuridiqueDB = {
    structures: Object.values(legalStatuses),
    getById
};

// Pour la compatibilité temporaire avec l'ancien code
// Ces lignes pourront être supprimées une fois la migration complète effectuée
window.legalStatuses = legalStatuses;
window.scales2025 = scales2025;
window.exclusionFilters = exclusionFilters;
window.ratingScales = ratingScales;
window.FormeJuridiqueDB = FormeJuridiqueDB;