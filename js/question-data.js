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
    {
        id: "marital_status",
        sectionId: "profile",
        title: "Situation matrimoniale",
        description: "Pour le calcul du quotient familial et du PFU",
        type: "radio",
        required: true,
        options: [
            { id: "single", label: "Célibataire", icon: "fa-user" },
            { id: "married", label: "Marié(e)/Pacsé(e)", icon: "fa-user-friends" },
            { id: "divorced", label: "Divorcé(e)", icon: "fa-user-slash" },
            { id: "widowed", label: "Veuf/Veuve", icon: "fa-user-alt" }
        ]
    },
    {
        id: "collaborating_spouse",
        sectionId: "profile",
        title: "Conjoint collaborateur",
        description: "Envisagez-vous d'avoir un conjoint collaborateur dans votre entreprise ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ],
        showIf: {
            "marital_status": ["married"]
        }
    },
    {
        id: "other_income",
        sectionId: "profile",
        title: "Autres revenus salariés",
        description: "Avez-vous d'autres revenus salariés par ailleurs ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "unemployment_benefits",
        sectionId: "profile",
        title: "Allocation chômage (ARE)",
        description: "Percevez-vous des allocations chômage actuellement ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "risk_appetite",
        sectionId: "profile",
        title: "Appétence au risque / caution",
        description: "Quel est votre niveau d'acceptation du risque professionnel ?",
        type: "slider",
        min: 1,
        max: 5,
        step: 1,
        default: 3,
        labels: {
            1: "Très faible",
            3: "Moyen",
            5: "Très élevé"
        },
        required: true
    },
    {
        id: "social_regime",
        sectionId: "profile",
        title: "Régime social visé",
        description: "Quel régime social souhaitez-vous privilégier ?",
        type: "radio",
        required: true,
        options: [
            { 
                id: "tns", 
                label: "Travailleur non salarié (TNS)", 
                icon: "fa-user-tie",
                description: "Cotisations sociales généralement moins élevées mais protection sociale réduite"
            },
            { 
                id: "assimilated_employee", 
                label: "Assimilé salarié", 
                icon: "fa-id-badge",
                description: "Protection sociale complète mais cotisations plus élevées"
            },
            { 
                id: "mixed", 
                label: "Mixte / Flexible", 
                icon: "fa-balance-scale",
                description: "Combinaison des deux régimes selon l'évolution de votre activité"
            }
        ]
    },
    {
        id: "project_horizon",
        sectionId: "profile",
        title: "Horizon du projet",
        description: "Sur quelle durée envisagez-vous votre projet ?",
        type: "radio",
        required: true,
        options: [
            { id: "short", label: "Court terme (1-2 ans)", icon: "fa-clock" },
            { id: "medium", label: "Moyen terme (3-5 ans)", icon: "fa-hourglass-half" },
            { id: "long", label: "Long terme (plus de 5 ans)", icon: "fa-calendar-alt" }
        ]
    },
    {
        id: "income_objective_year1",
        sectionId: "profile",
        title: "Objectif de revenu net - Année 1",
        description: "Quel revenu net mensuel souhaitez-vous dégager la première année ?",
        type: "number",
        min: 0,
        max: 50000,
        step: 100,
        default: 2000,
        format: "€/mois",
        required: true
    },
    {
        id: "income_objective_year3",
        sectionId: "profile",
        title: "Objectif de revenu net - Année 3",
        description: "Quel revenu net mensuel souhaitez-vous dégager en troisième année ?",
        type: "number",
        min: 0,
        max: 100000,
        step: 100,
        default: 3000,
        format: "€/mois",
        required: true
    },
    {
        id: "patrimony_protection",
        sectionId: "profile",
        title: "Protection du patrimoine",
        description: "Souhaitez-vous protéger votre patrimoine personnel ?",
        type: "radio",
        required: true,
        options: [
            { id: "essential", label: "Essentiel", icon: "fa-shield-alt" },
            { id: "important", label: "Important", icon: "fa-shield-alt" },
            { id: "secondary", label: "Secondaire", icon: "fa-shield-alt" }
        ]
    },

    // Section 2: Équipe & gouvernance
    {
        id: "team_structure",
        sectionId: "team",
        title: "Structure de l'équipe",
        description: "Comment votre équipe sera-t-elle constituée ?",
        type: "radio",
        required: true,
        options: [
            { id: "solo", label: "Solo (entreprise individuelle)", icon: "fa-user" },
            { id: "family", label: "Famille", icon: "fa-users" },
            { id: "associates", label: "Associés", icon: "fa-people-carry" },
            { id: "investors", label: "Avec investisseurs", icon: "fa-user-tie" }
        ]
    },
    {
        id: "associates_number",
        sectionId: "team",
        title: "Nombre d'associés",
        description: "Combien d'associés prévoyez-vous dans votre structure ?",
        type: "number",
        min: 2,
        max: 50,
        step: 1,
        default: 2,
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        },
        required: false
    },
    {
        id: "capital_percentage",
        sectionId: "team",
        title: "Pourcentage du capital",
        description: "Quel pourcentage du capital social détiendrez-vous ?",
        type: "slider",
        min: 1,
        max: 100,
        step: 1,
        default: 100,
        format: "%",
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        },
        required: true
    },
    {
        id: "associate_current_account",
        sectionId: "team",
        title: "Compte courant d'associé",
        description: "Envisagez-vous d'apporter des fonds en compte courant d'associé ?",
        type: "radio",
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ],
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        },
        required: true
    },
    {
        id: "approval_clause",
        sectionId: "team",
        title: "Clause d'agrément / préemption",
        description: "Souhaitez-vous une clause d'agrément ou de préemption ?",
        type: "radio",
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ],
        showIf: {
            "team_structure": ["family", "associates", "investors"]
        },
        required: true
    },
    {
        id: "investors_type",
        sectionId: "team",
        title: "Type d'investisseurs visés",
        description: "Quel type d'investisseurs envisagez-vous ?",
        type: "checkbox",
        options: [
            { id: "business_angels", label: "Business Angels", icon: "fa-angel" },
            { id: "venture_capital", label: "Venture Capital", icon: "fa-chart-line" },
            { id: "crowdfunding", label: "Crowdfunding", icon: "fa-users" }
        ],
        showIf: {
            "team_structure": ["investors"]
        },
        required: false
    },
    {
        id: "sharing_instruments",
        sectionId: "team",
        title: "Instruments de partage",
        description: "Envisagez-vous d'utiliser des instruments de partage ?",
        type: "checkbox",
        options: [
            { id: "bspce", label: "BSPCE", icon: "fa-certificate" },
            { id: "aga", label: "AGA (Actions Gratuites)", icon: "fa-gift" },
            { id: "stock_options", label: "Stock-options", icon: "fa-chart-bar" }
        ],
        showIf: {
            "team_structure": ["associates", "investors"]
        },
        required: false
    },
    {
        id: "governance_complexity",
        sectionId: "team",
        title: "Complexité de gouvernance",
        description: "Quel niveau de complexité de gouvernance souhaitez-vous ?",
        type: "radio",
        showIf: {
            "team_structure": ["associates", "investors"]
        },
        options: [
            { id: "simple", label: "Simple (statuts types)", icon: "fa-file-alt" },
            { id: "moderate", label: "Modérée (pacte d'associés)", icon: "fa-file-contract" },
            { id: "complex", label: "Complexe (structure sur-mesure)", icon: "fa-sitemap" }
        ],
        required: false
    },

    // Section 3: Nature de l'activité
    {
        id: "activity_type",
        sectionId: "activity",
        title: "Type d'activité",
        description: "Quelle est la nature de votre activité ?",
        type: "radio",
        required: true,
        options: [
            { id: "bic_sales", label: "BIC - Vente", icon: "fa-store" },
            { id: "bic_service", label: "BIC - Service", icon: "fa-concierge-bell" },
            { id: "mixed", label: "Mixte", icon: "fa-store-alt" },
            { id: "bnc", label: "BNC (professions libérales)", icon: "fa-user-md" },
            { id: "craft", label: "Artisanat", icon: "fa-hammer" },
            { id: "agricultural", label: "Agricole", icon: "fa-tractor" }
        ]
    },
    {
        id: "regulated_activity",
        sectionId: "activity",
        title: "Activité réglementée",
        description: "Votre activité est-elle réglementée ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "professional_order",
        sectionId: "activity",
        title: "Inscription à un ordre professionnel",
        description: "Votre activité nécessite-t-elle l'inscription à un ordre professionnel ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "order_type",
        sectionId: "activity",
        title: "Type d'ordre professionnel",
        description: "À quel ordre professionnel êtes-vous rattaché ?",
        type: "select",
        showIf: {
            "professional_order": ["yes"]
        },
        options: [
            { id: "cnb", label: "Conseil National des Barreaux (CNB)" },
            { id: "oec", label: "Ordre des Experts-Comptables" },
            { id: "cnom", label: "Conseil National de l'Ordre des Médecins" },
            { id: "cno", label: "Ordre National des Pharmaciens" },
            { id: "architectes", label: "Ordre des Architectes" },
            { id: "veterinaires", label: "Ordre des Vétérinaires" },
            { id: "other", label: "Autre ordre" }
        ],
        required: false
    },
    {
        id: "specific_approval",
        sectionId: "activity",
        title: "Agrément spécifique",
        description: "Votre activité nécessite-t-elle un agrément spécifique ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "amf", label: "AMF", icon: "fa-landmark" },
            { id: "arcep", label: "ARCEP", icon: "fa-broadcast-tower" },
            { id: "iobsp", label: "IOBSP", icon: "fa-money-bill-wave" },
            { id: "kyc", label: "KYC", icon: "fa-id-card" },
            { id: "other", label: "Autre", icon: "fa-plus-circle" }
        ]
    },
    {
        id: "high_professional_risk",
        sectionId: "activity",
        title: "Risques professionnels élevés",
        description: "Votre activité présente-t-elle des risques professionnels élevés (RC, dommages) ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-exclamation-triangle" },
            { id: "no", label: "Non", icon: "fa-check-circle" }
        ]
    },
    {
        id: "vat_regime",
        sectionId: "activity",
        title: "Régime TVA souhaité",
        description: "Quel régime de TVA souhaitez-vous appliquer ?",
        type: "radio",
        required: true,
        options: [
            { id: "franchise", label: "Franchise en base de TVA", icon: "fa-percent" },
            { id: "real", label: "Régime réel", icon: "fa-euro-sign" },
            { id: "simplified", label: "Réel simplifié", icon: "fa-file-invoice" },
            { id: "exempt", label: "Activité exonérée", icon: "fa-ban" }
        ]
    },
    {
        id: "cnil_rgpd",
        sectionId: "activity",
        title: "Conformité CNIL/RGPD",
        description: "Votre activité nécessite-t-elle une vérification CNIL/RGPD ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-shield-alt" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "intellectual_property",
        sectionId: "activity",
        title: "Propriété intellectuelle",
        description: "Votre activité implique-t-elle des enjeux de propriété intellectuelle ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "patents", label: "Brevets", icon: "fa-certificate" },
            { id: "trademarks", label: "Marques", icon: "fa-trademark" },
            { id: "copyright", label: "Droits d'auteur", icon: "fa-copyright" },
            { id: "software", label: "Logiciels", icon: "fa-laptop-code" }
        ]
    },

    // Section 4: Volumétrie & finances
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
        id: "gross_margin",
        sectionId: "finances",
        title: "Taux de marge brute",
        description: "Quel est votre taux de marge brute prévisionnel ?",
        type: "slider",
        min: 0,
        max: 100,
        step: 5,
        default: 50,
        format: "%",
        required: true
    },
    {
        id: "immediate_income",
        sectionId: "finances",
        title: "Besoin de revenus immédiats",
        description: "Avez-vous besoin de dégager des revenus dès le démarrage de l'activité ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "bank_guarantee",
        sectionId: "finances",
        title: "Caution bancaire",
        description: "Envisagez-vous de vous porter caution pour un prêt bancaire ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "bank_loan_amount",
        sectionId: "finances",
        title: "Montant du prêt",
        description: "Quel est le montant du prêt envisagé ?",
        type: "number",
        min: 0,
        max: 1000000,
        step: 1000,
        default: 0,
        format: "€",
        showIf: {
            "bank_guarantee": ["yes"]
        },
        required: false
    },
    {
        id: "fundraising",
        sectionId: "finances",
        title: "Levée de fonds envisagée",
        description: "Envisagez-vous une levée de fonds ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "fundraising_amount",
        sectionId: "finances",
        title: "Montant de la levée de fonds",
        description: "Quel montant souhaitez-vous lever ?",
        type: "number",
        min: 0,
        max: 10000000,
        step: 10000,
        default: 0,
        format: "€",
        showIf: {
            "fundraising": ["yes"]
        },
        required: false
    },
    {
        id: "remuneration_preference",
        sectionId: "finances",
        title: "Préférence de rémunération",
        description: "Quelle stratégie de rémunération privilégiez-vous ?",
        type: "radio",
        required: true,
        options: [
            { id: "salary", label: "Salaire", icon: "fa-money-bill-wave" },
            { id: "dividends", label: "Dividendes", icon: "fa-coins" },
            { id: "mixed", label: "Mixte", icon: "fa-balance-scale" },
            { id: "flexible", label: "Flexible", icon: "fa-sliders-h" }
        ]
    },
    {
        id: "expense_structure",
        sectionId: "finances",
        title: "Structure des dépenses",
        description: "Comment se répartissent vos principales dépenses ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "equipment", label: "Équipement important", icon: "fa-tools" },
            { id: "premises", label: "Locaux", icon: "fa-building" },
            { id: "salaries", label: "Salaires", icon: "fa-users" },
            { id: "stock", label: "Stock", icon: "fa-boxes" },
            { id: "marketing", label: "Marketing", icon: "fa-ad" }
        ]
    },

    // Section 5: Capital & apports
    {
        id: "available_capital",
        sectionId: "capital",
        title: "Capital social disponible",
        description: "Quel montant de capital social pouvez-vous apporter ?",
        type: "number",
        min: 0,
        max: 1000000,
        step: 100,
        default: 1000,
        format: "€",
        required: true
    },
    {
        id: "liberated_percentage",
        sectionId: "capital",
        title: "Pourcentage libéré",
        description: "Quel pourcentage du capital sera libéré immédiatement ?",
        type: "slider",
        min: 0,
        max: 100,
        step: 5,
        default: 100,
        format: "%",
        required: true
    },
    {
        id: "contributions_in_kind",
        sectionId: "capital",
        title: "Apports en nature",
        description: "Prévoyez-vous des apports en nature ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "contributions_in_kind_value",
        sectionId: "capital",
        title: "Valeur des apports en nature",
        description: "Quelle est la valeur estimée de vos apports en nature ?",
        type: "number",
        min: 0,
        max: 1000000,
        step: 100,
        default: 0,
        format: "€",
        showIf: {
            "contributions_in_kind": ["yes"]
        },
        infoText: "Si > 30 000 € ou > 50% du capital, un Commissaire aux Apports (CAC) sera obligatoire",
        required: false
    },
    {
        id: "associate_current_account_amount",
        sectionId: "capital",
        title: "Apports en compte courant d'associé",
        description: "Quel montant prévoyez-vous d'apporter en compte courant d'associé ?",
        type: "number",
        min: 0,
        max: 1000000,
        step: 100,
        default: 0,
        format: "€",
        required: false
    },
    {
        id: "progressive_contribution",
        sectionId: "capital",
        title: "Apport progressif",
        description: "Souhaitez-vous pouvoir apporter le capital de façon progressive ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "capital_structure",
        sectionId: "capital",
        title: "Structure du capital",
        description: "Comment souhaitez-vous structurer votre capital ?",
        type: "radio",
        required: false,
        showIf: {
            "team_structure": ["associates", "investors"]
        },
        options: [
            { id: "equal_shares", label: "Parts égales", icon: "fa-equals" },
            { id: "majority", label: "Majoritaire", icon: "fa-greater-than" },
            { id: "control", label: "Contrôle (>66%)", icon: "fa-crown" },
            { id: "minority", label: "Minoritaire", icon: "fa-less-than" }
        ]
    },

    // Section 6: Aides & dispositifs
    {
        id: "acre",
        sectionId: "aids",
        title: "ACRE",
        description: "Souhaitez-vous bénéficier de l'Aide à la Création ou Reprise d'Entreprise (ACRE) ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "jei_cir_cii",
        sectionId: "aids",
        title: "JEI / CIR / CII",
        description: "Envisagez-vous de recourir aux dispositifs suivants ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "jei", label: "Jeune Entreprise Innovante (JEI)", icon: "fa-lightbulb" },
            { id: "cir", label: "Crédit d'Impôt Recherche (CIR)", icon: "fa-flask" },
            { id: "cii", label: "Crédit d'Impôt Innovation (CII)", icon: "fa-rocket" }
        ]
    },
    {
        id: "zone",
        sectionId: "aids",
        title: "Zone d'implantation spécifique",
        description: "Votre entreprise sera-t-elle implantée dans une zone spécifique ?",
        type: "radio",
        required: true,
        options: [
            { id: "zfu", label: "Zone Franche Urbaine (ZFU)", icon: "fa-city" },
            { id: "qpv", label: "Quartier Prioritaire de la Ville (QPV)", icon: "fa-building" },
            { id: "zrr", label: "Zone de Revitalisation Rurale (ZRR)", icon: "fa-tree" },
            { id: "other", label: "Autre zone spécifique", icon: "fa-map-marker-alt" },
            { id: "none", label: "Aucune zone spécifique", icon: "fa-times-circle" }
        ]
    },
    {
        id: "bpi_aids",
        sectionId: "aids",
        title: "Aides BPI, régionales, DeepTech",
        description: "Envisagez-vous de solliciter des aides spécifiques ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "bpi", label: "Aides BPI France", icon: "fa-landmark" },
            { id: "regional", label: "Aides régionales", icon: "fa-map" },
            { id: "deeptech", label: "Label DeepTech", icon: "fa-atom" }
        ]
    },
    {
        id: "arce_eligibility",
        sectionId: "aids",
        title: "Éligibilité ARCE",
        description: "Êtes-vous éligible à l'Aide à la Reprise ou Création d'Entreprise (ARCE) ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "cumulative_devices",
        sectionId: "aids",
        title: "Cumul de dispositifs",
        description: "Souhaitez-vous cumuler plusieurs dispositifs d'aide ?",
        type: "checkbox",
        required: false,
        options: [
            { id: "acre_jei", label: "ACRE + JEI", icon: "fa-plus" },
            { id: "cir_cii", label: "CIR + CII", icon: "fa-plus" },
            { id: "zfu_acre", label: "ZFU + ACRE", icon: "fa-plus" },
            { id: "other", label: "Autres combinaisons", icon: "fa-plus" }
        ]
    },
    {
        id: "startup_incentives",
        sectionId: "aids",
        title: "Incitations pour startups",
        description: "Êtes-vous intéressé(e) par les incitations spécifiques aux startups ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },

    // Section 7: Sortie & transmission
    {
        id: "exit_intention",
        sectionId: "exit",
        title: "Intention de sortie",
        description: "Quelle est votre intention concernant la sortie du projet ?",
        type: "radio",
        required: true,
        options: [
            { id: "sale", label: "Revente", icon: "fa-handshake" },
            { id: "transmission", label: "Transmission", icon: "fa-exchange-alt" },
            { id: "undetermined", label: "Indéterminé", icon: "fa-question-circle" }
        ]
    },
    {
        id: "target_valuation",
        sectionId: "exit",
        title: "Valorisation cible",
        description: "Quelle valorisation ciblez-vous à terme ?",
        type: "number",
        min: 0,
        max: 10000000,
        step: 10000,
        default: 0,
        format: "€",
        showIf: {
            "exit_intention": ["sale", "transmission"]
        },
        required: false
    },
    {
        id: "exit_horizon",
        sectionId: "exit",
        title: "Horizon de sortie",
        description: "Dans combien d'années envisagez-vous cette sortie ?",
        type: "number",
        min: 1,
        max: 30,
        step: 1,
        default: 5,
        format: "années",
        showIf: {
            "exit_intention": ["sale", "transmission"]
        },
        required: false
    },
    {
        id: "donation_succession",
        sectionId: "exit",
        title: "Donation / Succession",
        description: "Avez-vous planifié une donation ou succession ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "partial_transfer",
        sectionId: "exit",
        title: "Cession partielle",
        description: "Envisagez-vous une cession partielle (LBO, earn-out) ?",
        type: "radio",
        required: true,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "family_transmission",
        sectionId: "exit",
        title: "Transmission familiale",
        description: "Envisagez-vous une transmission familiale de l'entreprise ?",
        type: "radio",
        required: false,
        showIf: {
            "exit_intention": ["transmission"]
        },
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "pacte_dutreil",
        sectionId: "exit",
        title: "Pacte Dutreil",
        description: "Êtes-vous intéressé(e) par le Pacte Dutreil pour la transmission ?",
        type: "radio",
        required: false,
        showIf: {
            "family_transmission": ["yes"]
        },
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" },
            { id: "need_info", label: "J'ai besoin d'informations", icon: "fa-info-circle" }
        ]
    },

    // Section 8: Options avancées
    {
        id: "holding_company",
        sectionId: "advanced",
        title: "Holding de tête",
        description: "Envisagez-vous de créer une holding de tête ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "tax_integration",
        sectionId: "advanced",
        title: "Intégration fiscale de groupe",
        description: "Souhaitez-vous mettre en place une intégration fiscale de groupe ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "is_option",
        sectionId: "advanced",
        title: "Option à l'IS pour EURL/EI",
        description: "Pour une EURL ou EI, souhaitez-vous opter pour l'impôt sur les sociétés (IS) ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "real_expenses_rate",
        sectionId: "advanced",
        title: "Projection micro vs réel",
        description: "Quel est votre taux de frais réels (pour comparer avec l'abattement forfaitaire du régime micro) ?",
        type: "slider",
        min: 0,
        max: 100,
        step: 5,
        default: 30,
        format: "%",
        required: false
    },
    {
        id: "multi_year_projection",
        sectionId: "advanced",
        title: "Projection pluriannuelle",
        description: "Souhaitez-vous une projection sur 3 ans ?",
        type: "radio",
        required: false,
        options: [
            { id: "yes", label: "Oui", icon: "fa-check-circle" },
            { id: "no", label: "Non", icon: "fa-times-circle" }
        ]
    },
    {
        id: "tax_optimization",
        sectionId: "advanced",
        title: "Optimisation fiscale",
        description: "Quelles stratégies d'optimisation fiscale vous intéressent ?",
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

    // Section 9: Priorisation des objectifs
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
];

// Questions pour la version "Quick Start" (5 questions seulement)
export const quickStartQuestions = [
    "age",
    "tax_bracket",
    "projected_revenue",
    "income_objective_year1",
    "priorities"
];

// Pour la compatibilité avec l'ancien code (sera supprimé à terme)
window.sections = sections;
window.questions = questions;
window.quickStartQuestions = quickStartQuestions;
