// question-data.js - Données pour le simulateur de forme juridique 2026

// Sections du questionnaire
const sections = [
    {
        id: "profile",
        title: "Profil",
        icon: "fa-user",
        description: "Situation personnelle, régime social et aides"
    },
    {
        id: "team",
        title: "Équipe",
        icon: "fa-users",
        description: "Structure de l'équipe et gouvernance"
    },
    {
        id: "activity",
        title: "Activité",
        icon: "fa-briefcase",
        description: "Nature de l'activité et réglementation"
    },
    {
        id: "finances",
        title: "Finances",
        icon: "fa-euro-sign",
        description: "CA, capital, fiscalité et financement"
    },
    {
        id: "exit",
        title: "Sortie",
        icon: "fa-sign-out-alt",
        description: "Stratégie de sortie et transmission"
    },
    {
        id: "priorities",
        title: "Priorités",
        icon: "fa-tasks",
        description: "Classez vos 3 priorités principales"
    }
];

// Questions du questionnaire
const questions = [
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
  id: "matrimonial_regime",
  sectionId: "profile",
  title: "Régime matrimonial",
  description: "Influe sur la propriété/valeur des parts et l’exposition des biens",
  type: "radio",
  required: true,
  options: [
    { id: "separation", label: "Séparation de biens", icon: "fa-unlink" },
    { id: "community", label: "Communauté réduite aux acquêts", icon: "fa-link" },
    { id: "universal_community", label: "Communauté universelle", icon: "fa-infinity" },
    { id: "unknown", label: "Je ne sais pas", icon: "fa-question-circle" }
  ],
  showIf: { "marital_status": ["married"] }
},
    {
  id: "apport_origin",
  sectionId: "profile",
  title: "Origine des fonds d’apport",
  description: "Détermine si l’apport/les parts sont propres ou communs",
  type: "radio",
  required: true,
  options: [
    { id: "personal_funds", label: "Fonds propres (biens personnels)", icon: "fa-user-lock" },
    { id: "community_funds", label: "Fonds communs au couple", icon: "fa-hand-holding-usd" },
    { id: "mixed", label: "Mixte (personnels + communs)", icon: "fa-exchange-alt" }
  ],
  showIf: { "marital_status": ["married"] }
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
  required: true,
  infoText: "Valeur indicative utilisée pour nuancer les recommandations (ex. ouverture aux cautions personnelles, formes à responsabilité illimitée)."
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
  showIf: { "team_structure": ["family", "associates", "investors"] },
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
  showIf: { "team_structure": ["family", "associates", "investors"] },
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
  showIf: { "team_structure": ["investors"] },
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
  showIf: { "team_structure": ["associates", "investors"] },
  required: false
},
{
  id: "governance_complexity",
  sectionId: "team",
  title: "Complexité de gouvernance",
  description: "Quel niveau de complexité de gouvernance souhaitez-vous ?",
  type: "radio",
  showIf: { "team_structure": ["associates", "investors"] },
  options: [
    { id: "simple", label: "Simple (statuts types)", icon: "fa-file-alt" },
    { id: "moderate", label: "Modérée (pacte d'associés)", icon: "fa-file-contract" },
    { id: "complex", label: "Complexe (structure sur-mesure)", icon: "fa-sitemap" }
  ],
  required: false
},

// --- Ajouts ciblés contrôle & investisseurs ---
{
  id: "control_preservation",
  sectionId: "team",
  title: "Préservation du contrôle",
  description: "Importance de conserver un contrôle fort (commandités, veto, actions de préférence) ?",
  type: "radio",
  required: true,
  options: [
    { id: "essential",  label: "Essentiel",  icon: "fa-crown" },
    { id: "important",  label: "Important",  icon: "fa-shield-alt" },
    { id: "secondary",  label: "Secondaire", icon: "fa-balance-scale" }
  ],
  showIf: { "team_structure": ["associates","investors","family"] }
},
{
  id: "family_project",
  sectionId: "team",
  title: "Projet familial",
  description: "Le noyau de contrôle doit-il rester dans la famille (ou un petit cercle) ?",
  type: "radio",
  required: false,
  options: [
    { id: "yes", label: "Oui" },
    { id: "no",  label: "Non" }
  ],
  showIf: { "team_structure": ["family","investors"] }
},
{
  id: "takeover_protection",
  sectionId: "team",
  title: "Protection anti-prise de contrôle hostile",
  description: "Souhaitez-vous des mécanismes anti-OPA/anti-dilution forts ?",
  type: "radio",
  required: false,
  options: [
    { id: "yes", label: "Oui" },
    { id: "no",  label: "Non" }
  ],
  showIf: { "team_structure": ["associates","investors","family"] }
},
{
  id: "investors_count",
  sectionId: "team",
  title: "Nombre d'investisseurs pressentis",
  description: "Combien d'investisseurs envisagez-vous de faire entrer au capital ?",
  type: "number",
  min: 0,
  max: 200,
  step: 1,
  default: 0,
  showIf: { "team_structure": ["investors"] }
},
{
  id: "investor_origin",
  sectionId: "team",
  title: "Origine des investisseurs",
  description: "Vos investisseurs sont-ils basés en France/UE ou à l'international ?",
  type: "radio",
  options: [
    { id: "domestic",      label: "France/UE" },
    { id: "international", label: "International" }
  ],
  showIf: { "team_structure": ["investors"] }
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
        { id: "agricultural", label: "Agricole", icon: "fa-tractor" },
        { id: "immobilier", label: "Immobilier", icon: "fa-building" }
    ]
},

// --- Début : questions spécifiques "Immobilier" (affichage conditionnel) ---
{
    id: "real_estate_activity",
    sectionId: "activity",
    title: "Type d’activité immobilière",
    description: "Précisez votre activité principale en immobilier",
    type: "radio",
    required: true,
    options: [
        { id: "lmnp_lmp", label: "Location meublée (LMNP / LMP)", icon: "fa-bed" },
        { id: "location_nue", label: "Location nue (habitation / pro)", icon: "fa-home" },
        { id: "marchand_biens", label: "Marchand de biens", icon: "fa-exchange-alt" },
        { id: "promotion", label: "Promotion immobilière", icon: "fa-city" },
        { id: "agence_gestion", label: "Agence / gestion immobilière", icon: "fa-user-tie" }
    ],
    showIf: { "activity_type": ["immobilier"] }
},
{
    id: "real_estate_rental_regime",
    sectionId: "activity",
    title: "Régime location meublée",
    description: "Si location meublée : précisez le régime",
    type: "radio",
    required: false,
    options: [
        { id: "lmnp", label: "LMNP (non professionnel)", icon: "fa-tag" },
        { id: "lmp", label: "LMP (professionnel)", icon: "fa-briefcase" }
    ],
    showIf: { "real_estate_activity": ["lmnp_lmp"] }
},
{
    id: "real_estate_property_use",
    sectionId: "activity",
    title: "Type de biens",
    description: "Quel type de biens visez-vous ?",
    type: "radio",
    required: false,
    options: [
        { id: "residential", label: "Résidentiel", icon: "fa-home" },
        { id: "commercial", label: "Commercial / professionnel", icon: "fa-store-alt" },
        { id: "mixed_use", label: "Mixte", icon: "fa-layer-group" }
    ],
    showIf: { "activity_type": ["immobilier"] }
},
// --- Fin : questions spécifiques "Immobilier" ---
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

    // Section 4: Volumétrie & finances
    {
        id: "projected_revenue",
        sectionId: "finances",
        title: "Chiffre d'affaires prévisionnel",
        description: "Quel chiffre d'affaires annuel prévoyez-vous pour la première année ? (Rappel: seuils micro 2026 - BIC vente: 203 100€, BIC service: 83 600€, BNC: 83 600€)",
        type: "slider",
        min: 0,
        max: 1000000,
        step: 1000,
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
  id: "personal_guarantee_scope",
  sectionId: "finances",
  title: "Périmètre des cautions",
  description: "Accepter que des biens communs puissent être engagés par une caution personnelle ?",
  type: "radio",
  required: true,
  options: [
    { id: "exclude_common", label: "Non, exclure autant que possible", icon: "fa-ban" },
    { id: "limit_common", label: "Oui mais encadrer fortement", icon: "fa-exclamation-triangle" },
    { id: "no_preference", label: "Sans préférence", icon: "fa-balance-scale" }
  ],
  showIf: { "bank_guarantee": ["yes"], "marital_status": ["married"] }
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

    // Capital (fusionné dans Finances)
    {
        id: "available_capital",
        sectionId: "finances",
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

    // Aides (fusionné dans Profil)
    {
        id: "acre",
        sectionId: "profile",
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
        sectionId: "profile",
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
        id: "is_option",
        sectionId: "finances",
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
        sectionId: "finances",
        title: "Projection micro vs réel",
       description: "Quel est votre taux de frais réels ? (À comparer avec l'abattement forfaitaire du régime micro-entreprise)",
        type: "slider",
        min: 0,
        max: 100,
        step: 5,
        default: 30,
        format: "%",
        required: false
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
const quickStartQuestions = [
    "age",
    "tax_bracket",
    "projected_revenue",
    "income_objective_year1",
    "priorities"
];

// Pour la compatibilité avec l'ancien code
window.sections = sections;
window.questions = questions;
window.quickStartQuestions = quickStartQuestions;
