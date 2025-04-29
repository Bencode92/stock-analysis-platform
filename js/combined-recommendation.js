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
    // Le reste des statuts...
    // ...
};

// S'assurer que window.legalStatuses est défini immédiatement
window.legalStatuses = legalStatuses;

// Déclencher l'événement indiquant que les statuts juridiques sont chargés
console.log("Déclenchement de l'événement legalStatusesLoaded depuis la fin du fichier");
document.dispatchEvent(new CustomEvent('legalStatusesLoaded'));

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
        SNC: 4,
        SCI: 4,
        SELARL: 3,
        SELAS: 3,
        SCA: 3
    },
    // Reste des échelles d'évaluation
    // ...
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
    // Règles du moteur...
    // ...
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
        
        // Dictionnaire des alternatives
        this.alternativeSuggestions = {
            // Alternatives...
            // ...
        };
        console.log("RecommendationEngine initialisé avec succès");
    }

    // Méthodes du moteur...
    // ...
}

// Mise à disposition de la classe pour l'application
window.RecommendationEngine = RecommendationEngine;

// Déclencher l'événement une seule fois, à la fin du fichier
// après que tout soit chargé et disponible
console.log("Déclenchement de l'événement recommendationEngineReady depuis la fin du fichier");
document.dispatchEvent(new CustomEvent('recommendationEngineReady'));