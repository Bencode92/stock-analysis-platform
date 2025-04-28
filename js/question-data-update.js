// Exemple d'ajout de questions supplémentaires pour le questionnaire
// À intégrer dans question-data.js

// Exemple de questions supplémentaires pour la section "Capital & apports"
const additionalCapitalQuestions = [
    {
        id: "capital_distribution",
        sectionId: "capital",
        title: "Répartition du capital",
        description: "Comment prévoyez-vous de répartir le capital entre les associés ?",
        type: "slider",
        min: 0,
        max: 100,
        step: 5,
        default: 100,
        format: "%",
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        },
        required: false
    },
    {
        id: "shares_valuation",
        sectionId: "capital",
        title: "Valorisation des parts",
        description: "Comment évaluez-vous la valeur de vos parts sociales ou actions ?",
        type: "radio",
        required: false,
        options: [
            { id: "nominal", label: "Valeur nominale", icon: "fa-tag" },
            { id: "market", label: "Valeur de marché", icon: "fa-chart-line" },
            { id: "future", label: "Valorisation future", icon: "fa-chart-line" },
            { id: "undecided", label: "Je ne sais pas encore", icon: "fa-question-circle" }
        ],
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        }
    },
    {
        id: "capital_increase",
        sectionId: "capital",
        title: "Augmentation de capital",
        description: "Envisagez-vous des augmentations de capital à court ou moyen terme ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes_short", label: "Oui, à court terme", icon: "fa-calendar-alt" },
            { id: "yes_medium", label: "Oui, à moyen terme", icon: "fa-calendar-alt" },
            { id: "no", label: "Non", icon: "fa-times-circle" },
            { id: "undecided", label: "Je ne sais pas encore", icon: "fa-question-circle" }
        ]
    }
];

// Exemple de questions supplémentaires pour la section "Aides & dispositifs"
const additionalAidsQuestions = [
    {
        id: "startup_incentives",
        sectionId: "aids",
        title: "Dispositifs d'incitation pour les startups",
        description: "Souhaitez-vous bénéficier des dispositifs d'incitation spécifiques aux startups ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "french_tech", label: "French Tech", icon: "fa-flag" },
            { id: "bpi_loan", label: "Prêt BPI", icon: "fa-landmark" },
            { id: "research_credit", label: "Crédit Impôt Recherche", icon: "fa-flask" },
            { id: "innovation_grant", label: "Subvention Innovation", icon: "fa-lightbulb" }
        ]
    },
    {
        id: "regional_aid",
        sectionId: "aids",
        title: "Aides régionales",
        description: "Dans quelle région comptez-vous implanter votre entreprise ?",
        type: "select",
        required: false,
        options: [
            { id: "ile_de_france", label: "Île-de-France" },
            { id: "auvergne_rhone_alpes", label: "Auvergne-Rhône-Alpes" },
            { id: "nouvelle_aquitaine", label: "Nouvelle-Aquitaine" },
            { id: "occitanie", label: "Occitanie" },
            { id: "hauts_de_france", label: "Hauts-de-France" },
            { id: "grand_est", label: "Grand Est" },
            { id: "provence_alpes", label: "Provence-Alpes-Côte d'Azur" },
            { id: "pays_de_la_loire", label: "Pays de la Loire" },
            { id: "normandie", label: "Normandie" },
            { id: "bretagne", label: "Bretagne" },
            { id: "bourgogne", label: "Bourgogne-Franche-Comté" },
            { id: "centre_val_de_loire", label: "Centre-Val de Loire" },
            { id: "corse", label: "Corse" },
            { id: "outre_mer", label: "Outre-Mer" },
            { id: "outside_france", label: "Hors de France" }
        ]
    }
];

// Exemple de questions supplémentaires pour la section "Options avancées"
const additionalAdvancedQuestions = [
    {
        id: "tax_optimization",
        sectionId: "advanced",
        title: "Optimisation fiscale",
        description: "Quelles stratégies d'optimisation fiscale souhaitez-vous explorer ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "holding", label: "Structure de holding", icon: "fa-building" },
            { id: "ip_box", label: "IP Box / Patent Box", icon: "fa-file-contract" },
            { id: "international", label: "Structure internationale", icon: "fa-globe" },
            { id: "r_and_d", label: "Optimisation R&D", icon: "fa-flask" }
        ]
    },
    {
        id: "accounting_complexity",
        sectionId: "advanced",
        title: "Complexité comptable",
        description: "Quel niveau de complexité comptable pouvez-vous gérer ?",
        type: "radio",
        required: false,
        options: [
            { id: "simple", label: "Simple (comptabilité de trésorerie)", icon: "fa-calculator" },
            { id: "moderate", label: "Modérée (comptabilité sans TVA)", icon: "fa-calculator" },
            { id: "complete", label: "Complète (comptabilité d'engagement)", icon: "fa-calculator" },
            { id: "outsourced", label: "Externalisée (expert-comptable)", icon: "fa-user-tie" }
        ]
    },
    {
        id: "governance_model",
        sectionId: "advanced",
        title: "Modèle de gouvernance",
        description: "Quel modèle de gouvernance envisagez-vous pour votre entreprise ?",
        type: "radio",
        required: false,
        options: [
            { id: "centralized", label: "Centralisé (pouvoir concentré)", icon: "fa-user-crown" },
            { id: "collaborative", label: "Collaboratif (pouvoir partagé)", icon: "fa-users-cog" },
            { id: "board", label: "Conseil d'administration", icon: "fa-users" },
            { id: "supervisory", label: "Directoire et conseil de surveillance", icon: "fa-sitemap" }
        ],
        showIf: {
            "team_structure": ["associates", "investors"]
        }
    }
];

/* 
Pour intégrer ces questions, ajoutez ces tableaux au fichier question-data.js 
et incluez-les dans le tableau principal 'questions' comme ceci :

export const questions = [
    ...questionsExistantes,
    ...additionalCapitalQuestions,
    ...additionalAidsQuestions,
    ...additionalAdvancedQuestions,
    // etc.
];
*/
