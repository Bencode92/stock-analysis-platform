// question-data.js - Données pour le simulateur de forme juridique 2025

// Sections du questionnaire
export const sections = [
    {
        id: "profile",
        title: "Profil & horizon personnel",
        icon: "fa-user",
        description: "Informations sur votre situation personnelle"
    },
    {
        id: "team",
        title: "Équipe & gouvernance",
        icon: "fa-users",
        description: "Composition et structure de l'équipe"
    },
    {
        id: "activity",
        title: "Nature de l'activité",
        icon: "fa-briefcase",
        description: "Type d'activité et réglementation"
    },
    {
        id: "finances",
        title: "Volumétrie & finances",
        icon: "fa-euro-sign",
        description: "Aspects financiers et prévisionnels"
    },
    {
        id: "capital",
        title: "Capital & apports",
        icon: "fa-piggy-bank",
        description: "Structure du capital et apports initiaux"
    },
    {
        id: "aids",
        title: "Aides & dispositifs",
        icon: "fa-hands-helping",
        description: "Aides et dispositifs applicables"
    },
    {
        id: "exit",
        title: "Sortie & transmission",
        icon: "fa-sign-out-alt",
        description: "Stratégie de sortie et transmission"
    },
    {
        id: "advanced",
        title: "Options avancées",
        icon: "fa-cogs",
        description: "Paramètres avancés pour utilisateurs experts",
        isAdvanced: true
    },
    {
        id: "priorities",
        title: "Priorisation des objectifs",
        icon: "fa-tasks",
        description: "Définissez vos priorités principales"
    }
];

// Questions du questionnaire
export const questions = [
    // Section 1: Profil & horizon personnel
    {
        id: "age",
        sectionId: "profile",
        title: "Votre âge",
        description: "Cette information est utilisée pour les dispositifs liés à l'âge (retraite, ACRE, seuils de cotisations)",
        type: "select",
        required: true,
        options: [
            { id: "minor", label: "Moins de 18 ans" },
            { id: "young_adult", label: "18-25 ans" },
            { id: "adult_26_30", label: "26-30 ans" },
            { id: "adult_31_40", label: "31-40 ans" },
            { id: "adult_41_50", label: "41-50 ans" },
            { id: "adult_51_60", label: "51-60 ans" },
            { id: "senior", label: "Plus de 60 ans" }
        ],
        additionalControls: [
            {
                id: "emancipated_minor",
                type: "checkbox",
                label: "Je suis mineur émancipé",
                showIf: "minor" // Affiché seulement si "Moins de 18 ans" est sélectionné
            }
        ]
    },
    {
        id: "tax_bracket",
        sectionId: "profile",
        title: "Tranche marginale d'imposition (TMI) actuelle",
        description: "Votre TMI actuelle et les revenus de votre foyer",
        type: "select",
        required: true,
        options: [
            { id: "non_taxable", label: "Non imposable" },
            { id: "bracket_11", label: "11%" },
            { id: "bracket_30", label: "30%" },
            { id: "bracket_41", label: "41%" },
            { id: "bracket_45", label: "45%" }
        ]
    },
    // Autres questions omises pour brièveté
    // ...
    {
        id: "projected_revenue",
        sectionId: "finances",
        title: "Chiffre d'affaires prévisionnel",
        description: "Quel chiffre d'affaires annuel prévoyez-vous pour la première année ? (Rappel: seuils micro 2025 - BIC vente: 188 700€, BIC service: 77 700€, BNC: 77 700€)",
        type: "slider",
        min: 0,
        max: 500000,
        step: 5000,
        default: 50000,
        format: "€",
        required: true
    },
    {
        id: "priorities",
        sectionId: "priorities",
        title: "Vos priorités",
        description: "Faites glisser pour classer vos 3 priorités principales",
        type: "drag_and_drop",
        required: true,
        options: [
            { id: "taxation", label: "Fiscalité", icon: "fa-file-invoice-dollar" },
            { id: "social_cost", label: "Coût social", icon: "fa-euro-sign" },
            { id: "patrimony_protection", label: "Protection du patrimoine", icon: "fa-shield-alt" },
            { id: "governance_flexibility", label: "Souplesse de gouvernance", icon: "fa-cogs" },
            { id: "fundraising", label: "Facilité de levée de fonds", icon: "fa-hand-holding-usd" },
            { id: "transmission", label: "Transmission", icon: "fa-exchange-alt" },
            { id: "admin_simplicity", label: "Simplicité administrative", icon: "fa-file-alt" },
            { id: "accounting_cost", label: "Coût comptable", icon: "fa-calculator" },
            { id: "retirement_insurance", label: "Prévoyance / Retraite", icon: "fa-umbrella" }
        ]
    }
    // Note: De nombreuses questions ont été omises pour brièveté, le fichier original contient toutes les questions
];

// Questions pour la version "Quick Start" (5 questions seulement)
export const quickStartQuestions = [
    "age",
    "tax_bracket",
    "projected_revenue",
    "income_objective_year1",
    "priorities"
];

// Pour la compatibilité temporaire avec l'ancien code
// Ces lignes pourront être supprimées une fois la migration complète effectuée
window.sections = sections;
window.questions = questions;
window.quickStartQuestions = quickStartQuestions;
